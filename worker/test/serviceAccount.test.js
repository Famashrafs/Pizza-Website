// Service-account OAuth token minting tests (worker/src/serviceAccount.js).
//
// A real RSA-2048 key pair is generated in-process and a local HTTP server
// VERIFIES the signed JWT assertion with the public key, so the WebCrypto
// RS256 signing path is proven end to end — not mocked.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { parseServiceAccount, createAccessTokenProvider, base64url } from '../src/serviceAccount.js';
import { generateRsaKeyPair } from './helpers/jwt.js';

function pemEncode(der) {
  const b64 = Buffer.from(der).toString('base64');
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

async function makeAccount() {
  const pair = await generateRsaKeyPair();
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    account: {
      type: 'service_account',
      project_id: 'demo-worker-test',
      client_email: 'sdk@demo-worker-test.iam.gserviceaccount.com',
      private_key: pemEncode(pkcs8),
    },
    pair,
  };
}

// Local token endpoint: verifies the RS256 assertion signature for real.
function startTokenServer(pair) {
  const state = { requests: 0 };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        state.requests += 1;
        handle(req, raw)
          .then((result) => {
            res.writeHead(result.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result.body));
          })
          .catch((err) => {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err && err.message) }));
          });
      });
    });

    async function handle(req, raw) {
      if (req.method !== 'POST') return { status: 405, body: {} };
      const params = new URLSearchParams(raw);
      assert.equal(params.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const assertion = params.get('assertion') || '';
      const [h, p, s] = assertion.split('.');
      assert.ok(h && p && s, 'assertion must be a JWT');

      const header = JSON.parse(Buffer.from(h, 'base64url').toString());
      const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
      assert.equal(header.alg, 'RS256');
      assert.equal(claims.iss, 'sdk@demo-worker-test.iam.gserviceaccount.com');
      assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
      assert.equal(claims.scope, 'https://www.googleapis.com/auth/datastore');

      const valid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        pair.publicKey,
        Buffer.from(s, 'base64url'),
        new TextEncoder().encode(`${h}.${p}`)
      );
      if (!valid) return { status: 401, body: { error: 'invalid_grant' } };
      return {
        status: 200,
        body: { access_token: `tok-${state.requests}`, token_type: 'Bearer', expires_in: 3600 },
      };
    }
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        state,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test('parseServiceAccount rejects missing/invalid/partial credentials', () => {
  assert.throws(() => parseServiceAccount(''), /required/);
  assert.throws(() => parseServiceAccount('{nope'), /not valid JSON/);
  assert.throws(() => parseServiceAccount('{"project_id":"p"}'), /project_id, client_email and private_key/);
  assert.deepEqual(parseServiceAccount('{"project_id":"p","private_key":"k","client_email":"e"}'), {
    project_id: 'p',
    private_key: 'k',
    client_email: 'e',
  });
});

test('mints a RS256-signed OAuth token the Google endpoint would accept, and caches it', async () => {
  const { account, pair } = await makeAccount();
  const tokenServer = await startTokenServer(pair);
  // Point the provider at the local endpoint by patching global fetch's view
  // of the token URL via an injected fetchImpl.
  const originalFetch = globalThis.fetch;
  const fetchImpl = (url, options) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) {
      return originalFetch(`${tokenServer.origin}/token`, options);
    }
    return originalFetch(url, options);
  };

  try {
    const getAccessToken = createAccessTokenProvider({ account, fetchImpl });
    const first = await getAccessToken();
    assert.equal(first, 'tok-1');

    // Second call must reuse the cached token (no extra HTTP round trip).
    const second = await getAccessToken();
    assert.equal(second, 'tok-1');
    assert.equal(tokenServer.state.requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await tokenServer.close();
  }
});

test('surfaces token-endpoint failures without leaking the response body', async () => {
  const { account } = await makeAccount();
  const server = http.createServer((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'secret detail' }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) =>
    url.startsWith('https://oauth2.googleapis.com/token')
      ? originalFetch(`http://127.0.0.1:${port}/t`, options)
      : originalFetch(url, options);

  try {
    const getAccessToken = createAccessTokenProvider({ account });
    await assert.rejects(() => getAccessToken(), /responded with 401/);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((r) => server.close(r));
  }
});

test('base64url encodes bytes without padding', () => {
  assert.equal(base64url(new TextEncoder().encode('anyway')), Buffer.from('anyway').toString('base64url'));
  assert.ok(!base64url(new Uint8Array([251, 255])).includes('='));
});
