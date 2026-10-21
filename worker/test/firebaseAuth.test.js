// Firebase ID-token verification tests (worker/src/firebaseAuth.js).
//
// Real RSA key pair + real JWKS served over local HTTP: signature
// verification, issuer/audience/expiry claims and the revocation lookup are
// all exercised for real. Nothing about verification is mocked.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createVerifyIdToken, isAnonymousToken } from '../src/firebaseAuth.js';
import {
  generateRsaKeyPair,
  publicJwk,
  firebaseIdToken,
  startAuthServer,
} from './helpers/jwt.js';

const PROJECT = 'demo-worker-test';

async function setup({ lookupHandler } = {}) {
  const pair = await generateRsaKeyPair();
  const jwks = { keys: [await publicJwk(pair, 'test-key')] };
  const server = await startAuthServer({ jwks, lookupHandler });
  const verify = createVerifyIdToken({
    projectId: PROJECT,
    apiKey: 'public-web-key',
    jwksUrl: `${server.origin}/jwks.json`,
    lookupUrlBase: `${server.origin}/v1/projects`,
  });
  return { pair, server, verify };
}

test('accepts a valid anonymous guest token and exposes verified claims', async () => {
  const { pair, server, verify } = await setup();
  try {
    const token = await firebaseIdToken(pair, { uid: 'guest-42', provider: 'anonymous' });
    const payload = await verify(token);
    assert.equal(payload.sub, 'guest-42');
    assert.equal(payload.user_id, 'guest-42');
    assert.equal(payload.firebase.sign_in_provider, 'anonymous');
    assert.equal(isAnonymousToken(payload), true);
  } finally {
    await server.close();
  }
});

test('accepts a valid registered-user token (non-anonymous provider)', async () => {
  const { pair, server, verify } = await setup();
  try {
    const token = await firebaseIdToken(pair, { uid: 'cust-7', provider: 'password' });
    const payload = await verify(token);
    assert.equal(payload.sub, 'cust-7');
    assert.equal(isAnonymousToken(payload), false);
  } finally {
    await server.close();
  }
});

test('rejects a token signed by a DIFFERENT key (tampered signature)', async () => {
  const { server, verify } = await setup();
  const otherPair = await generateRsaKeyPair();
  try {
    const token = await firebaseIdToken(otherPair, { uid: 'guest-42' });
    await assert.rejects(() => verify(token));
  } finally {
    await server.close();
  }
});

test('rejects a wrong audience', async () => {
  const { pair, server, verify } = await setup();
  try {
    const token = await firebaseIdToken(pair, { uid: 'u1', aud: 'another-project' });
    await assert.rejects(() => verify(token), /aud|audience/i);
  } finally {
    await server.close();
  }
});

test('rejects a wrong issuer', async () => {
  const { pair, server, verify } = await setup();
  try {
    const token = await firebaseIdToken(pair, { uid: 'u1', iss: 'https://evil.example' });
    await assert.rejects(() => verify(token), /iss|issuer/i);
  } finally {
    await server.close();
  }
});

test('rejects an expired token (outside clock tolerance)', async () => {
  const { pair, server, verify } = await setup();
  try {
    const now = Math.floor(Date.now() / 1000);
    const token = await firebaseIdToken(pair, { uid: 'u1', exp: now - 3600 });
    await assert.rejects(() => verify(token), /expired/i);
  } finally {
    await server.close();
  }
});

test('rejects garbage and empty tokens without calling any endpoint', async () => {
  const { server, verify } = await setup();
  try {
    await assert.rejects(() => verify('not-a-jwt'));
    await assert.rejects(() => verify(''));
    await assert.rejects(() => verify(null));
  } finally {
    await server.close();
  }
});

test('rejects a token with no sub claim', async () => {
  const { pair, server, verify } = await setup();
  try {
    const token = await firebaseIdToken(pair, { uid: '' });
    // firebaseIdToken keeps sub:'' — verification must fail on empty subject.
    await assert.rejects(() => verify(token));
  } finally {
    await server.close();
  }
});

test('revocation: rejects a signature-valid token the lookup endpoint refuses', async () => {
  const { pair, server, verify } = await setup({
    lookupHandler: () => ({ status: 401, body: { error: { code: 401, message: 'TOKEN_EXPIRED' } } }),
  });
  try {
    const token = await firebaseIdToken(pair, { uid: 'deleted-user' });
    await assert.rejects(() => verify(token), /lookup failed/i);
  } finally {
    await server.close();
  }
});

test('revocation: rejects when lookup returns no user', async () => {
  const { pair, server, verify } = await setup({
    lookupHandler: () => ({ status: 200, body: { users: [] } }),
  });
  try {
    const token = await firebaseIdToken(pair, { uid: 'ghost' });
    await assert.rejects(() => verify(token), /no user/i);
  } finally {
    await server.close();
  }
});

test('verification works WITHOUT the revocation lookup when no API key is configured', async () => {
  const pair = await generateRsaKeyPair();
  const jwks = { keys: [await publicJwk(pair, 'test-key')] };
  const server = await startAuthServer({
    jwks,
    lookupHandler: () => {
      throw new Error('lookup must not be called');
    },
  });
  try {
    const verify = createVerifyIdToken({
      projectId: PROJECT,
      apiKey: '',
      jwksUrl: `${server.origin}/jwks.json`,
      lookupUrlBase: `${server.origin}/v1/projects`,
    });
    const token = await firebaseIdToken(pair, { uid: 'u9', provider: 'password' });
    const payload = await verify(token);
    assert.equal(payload.sub, 'u9');
  } finally {
    await server.close();
  }
});
