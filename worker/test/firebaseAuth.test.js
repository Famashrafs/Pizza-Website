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
const API_KEY = 'public-web-key';

async function setup({ lookupHandler, apiKey = API_KEY } = {}) {
  const pair = await generateRsaKeyPair();
  const jwks = { keys: [await publicJwk(pair, 'test-key')] };
  const server = await startAuthServer({ jwks, lookupHandler });
  const logs = [];
  const verify = createVerifyIdToken({
    projectId: PROJECT,
    apiKey,
    jwksUrl: `${server.origin}/jwks.json`,
    // The end-user accounts:lookup lives directly under /v1 — NOT under
    // /v1/projects/{id} (that variant needs an OAuth2 service account).
    lookupUrlBase: `${server.origin}/v1`,
    logDiagnostic: (entry) => logs.push(entry),
  });
  return { pair, server, verify, logs };
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
  const { pair, server, verify, logs } = await setup({
    lookupHandler: () => ({
      status: 400,
      body: { error: { code: 400, message: "INVALID_ID_TOKEN : The user's credential is no longer valid." } },
    }),
  });
  try {
    const token = await firebaseIdToken(pair, { uid: 'deleted-user' });
    await assert.rejects(() => verify(token), /lookup failed/i);

    // The diagnostic records the status and a sanitized code only.
    const entry = logs.find((l) => l.outcome === 'rejected');
    assert.ok(entry, 'a diagnostic entry must be logged');
    assert.equal(entry.status, 400);
    assert.equal(entry.code, 'INVALID_ID_TOKEN');

    // Never the token, never the API key.
    const dumped = JSON.stringify(logs);
    assert.ok(!dumped.includes(token), 'the ID token must never be logged');
    assert.ok(!dumped.includes(API_KEY), 'the API key must never be logged');
  } finally {
    await server.close();
  }
});

test('uses the documented end-user accounts:lookup endpoint, not the project-scoped admin one', async () => {
  let seenUrl = null;
  let seenBody = null;
  const { pair, server, verify } = await setup({
    lookupHandler: (req, raw) => {
      seenUrl = req.url;
      seenBody = JSON.parse(raw);
      return { status: 200, body: { users: [{ localId: 'user-1' }] } };
    },
  });
  try {
    const token = await firebaseIdToken(pair, { uid: 'guest-42', provider: 'anonymous' });
    await verify(token);

    const url = new URL(seenUrl, 'http://lookup.test');
    // The admin variant (v1/projects/{id}/accounts:lookup) requires an OAuth2
    // service-account credential; an API key cannot authorize it.
    assert.equal(url.pathname, '/v1/accounts:lookup');
    assert.ok(!seenUrl.includes('/projects/'), 'must not use the project-scoped endpoint');
    assert.equal(url.searchParams.get('key'), API_KEY);
    assert.equal(seenBody.idToken, token);
  } finally {
    await server.close();
  }
});

test('an Identity Toolkit outage is an availability problem, not an invalid session', async () => {
  const { pair, server, verify, logs } = await setup({
    lookupHandler: () => ({ status: 503, body: { error: { code: 503, message: 'Backend Error' } } }),
  });
  try {
    const token = await firebaseIdToken(pair, { uid: 'guest-42' });
    await assert.rejects(
      () => verify(token),
      (err) => err.name === 'UpstreamUnavailableError'
    );
    const entry = logs.find((l) => l.outcome === 'rejected');
    assert.equal(entry.status, 503);
  } finally {
    await server.close();
  }
});

test('a rejected API key is an availability problem (never "session expired")', async () => {
  const { pair, server, verify, logs } = await setup({
    lookupHandler: () => ({
      status: 401,
      body: { error: { code: 401, message: 'API key not valid. Please pass a valid API key.' } },
    }),
  });
  try {
    const token = await firebaseIdToken(pair, { uid: 'guest-42' });
    await assert.rejects(
      () => verify(token),
      (err) => err.name === 'UpstreamUnavailableError'
    );
    const entry = logs.find((l) => l.outcome === 'rejected');
    assert.equal(entry.status, 401);
    assert.equal(entry.code, 'API_KEY_INVALID');
  } finally {
    await server.close();
  }
});

// The project-scoped admin endpoint refuses an API-key request with
// "INSUFFICIENT_PERMISSION : Only authenticated requests can specify
// target_project_id." — that is a SERVICE problem, never a bad session.
test('a permission failure on the lookup is an availability problem', async () => {
  const { pair, server, verify, logs } = await setup({
    lookupHandler: () => ({
      status: 400,
      body: {
        error: {
          code: 400,
          message: 'INSUFFICIENT_PERMISSION : Only authenticated requests can specify target_project_id.',
        },
      },
    }),
  });
  try {
    const token = await firebaseIdToken(pair, { uid: 'guest-42' });
    await assert.rejects(
      () => verify(token),
      (err) => err.name === 'UpstreamUnavailableError'
    );
    const entry = logs.find((l) => l.outcome === 'rejected');
    assert.equal(entry.status, 400);
    assert.equal(entry.code, 'INSUFFICIENT_PERMISSION');
  } finally {
    await server.close();
  }
});

test('an unreachable Identity Toolkit logs nothing but a fixed code', async () => {
  const pair = await generateRsaKeyPair();
  const jwks = { keys: [await publicJwk(pair, 'test-key')] };
  const server = await startAuthServer({ jwks });
  const logs = [];
  try {
    const verify = createVerifyIdToken({
      projectId: PROJECT,
      apiKey: API_KEY,
      jwksUrl: `${server.origin}/jwks.json`,
      lookupUrlBase: `${server.origin}/v1`,
      fetchImpl: async () => {
        throw new Error(`network down for https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`);
      },
      logDiagnostic: (entry) => logs.push(entry),
    });
    const token = await firebaseIdToken(pair, { uid: 'guest-42' });
    await assert.rejects(
      () => verify(token),
      (err) => err.name === 'UpstreamUnavailableError'
    );

    const entry = logs.find((l) => l.outcome === 'unreachable');
    assert.ok(entry, 'a diagnostic entry must be logged');
    assert.equal(entry.code, 'LOOKUP_UNREACHABLE');
    const dumped = JSON.stringify(logs);
    assert.ok(!dumped.includes(token), 'the ID token must never be logged');
    assert.ok(!dumped.includes(API_KEY), 'the API key must never be logged');
    assert.ok(!/identitytoolkit/.test(dumped), 'the request URL must never be logged');
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
      lookupUrlBase: `${server.origin}/v1`,
    });
    const token = await firebaseIdToken(pair, { uid: 'u9', provider: 'password' });
    const payload = await verify(token);
    assert.equal(payload.sub, 'u9');
  } finally {
    await server.close();
  }
});
