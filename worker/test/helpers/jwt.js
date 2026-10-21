// RSA key + JWT helpers for the Worker auth tests. Generates a real RSA-2048
// key pair in-process (WebCrypto) and serves a JWKS from a local HTTP server,
// so token SIGNATURE verification runs for real — nothing is mocked away.

'use strict';

import http from 'node:http';

const BASE64URL = (n) => Buffer.from(n).toString('base64url');

export async function generateRsaKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  return pair;
}

export async function publicJwk(pair, kid) {
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig', kid };
}

export async function signJwt(pair, header, payload) {
  const input = `${BASE64URL(JSON.stringify(header))}.${BASE64URL(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    pair.privateKey,
    new TextEncoder().encode(input)
  );
  return `${input}.${BASE64URL(signature)}`;
}

export function firebaseIdToken(pair, {
  kid = 'test-key',
  projectId = 'demo-worker-test',
  uid = 'user-1',
  provider = 'anonymous',
  exp,
  iss,
  aud,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    pair,
    { alg: 'RS256', typ: 'JWT', kid },
    {
      iss: iss ?? `https://securetoken.google.com/${projectId}`,
      aud: aud ?? projectId,
      auth_time: now,
      user_id: uid,
      sub: uid,
      iat: now,
      exp: exp ?? now + 3600,
      email: '',
      firebase: {
        identities: {},
        sign_in_provider: provider,
      },
    }
  );
}

// Starts a local server exposing:
//   GET  /jwks.json           — { keys: [jwk] }
//   POST /v1/projects/:p/accounts:lookup — revocation endpoint
// The lookup handler is pluggable per test.
export function startAuthServer({ jwks, lookupHandler }) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        if (req.method === 'GET' && req.url === '/jwks.json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(jwks));
          return;
        }
        if (req.method === 'POST' && /\/accounts:lookup/.test(req.url)) {
          const result = lookupHandler
            ? lookupHandler(req, raw)
            : { status: 200, body: { users: [{ localId: 'user-1' }] } };
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.body));
          return;
        }
        res.writeHead(404).end('{}');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
