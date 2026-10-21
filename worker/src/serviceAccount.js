// Service-account credentials for the Firestore REST API.
//
// The Firebase Admin SDK cannot run on Cloudflare Workers (it needs the Node
// runtime and gRPC). Instead the Worker talks to Firestore through its REST
// API with an OAuth2 access token minted from the SAME service-account
// credential the Admin SDK would use, so database access stays server-side,
// authenticated and admin-equivalent (security rules are bypassed exactly like
// the Admin SDK — which is why firestore.rules continue to deny ALL client
// order creation).
//
// The credential is supplied at runtime through the FIREBASE_SERVICE_ACCOUNT_JSON
// secret (wrangler secret put) — never committed, never logged.
//
// Access tokens are cached per isolate for ~50 minutes (Google-issued tokens
// live for 1 hour); each new isolate pays one token mint (~1 HTTPS round trip).

'use strict';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';
const TOKEN_LIFETIME_SEC = 3600;
// Mint a fresh token this many seconds before Google's expiry.
const TOKEN_SKEW_SEC = 600;

export function parseServiceAccount(raw) {
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is required (wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON).'
    );
  }
  let account;
  try {
    account = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
  if (!account.project_id || !account.private_key || !account.client_email) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON must contain project_id, client_email and private_key.'
    );
  }
  return account;
}

// base64url without padding, for arbitrary bytes. (No Buffer on Workers;
// btoa is available in both Workers and Node.)
export function base64url(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64urlToString(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 ? '='.repeat(4 - (padded.length % 4)) : '';
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// PEM (PKCS#8) → DER bytes for crypto.subtle.importKey.
function pemToDer(pem) {
  const body = String(pem)
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importPrivateKey(pem) {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signAssertion(account, nowSec) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + TOKEN_LIFETIME_SEC,
  };
  const signingInput = `${base64url(new TextEncoder().encode(JSON.stringify(header)))}.${base64url(
    new TextEncoder().encode(JSON.stringify(claims))
  )}`;
  const key = await importPrivateKey(account.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Build a cached OAuth2 access-token provider for the Firestore REST API.
 *
 * @param {object} deps
 * @param {object} deps.account Parsed service-account (parseServiceAccount).
 * @param {typeof fetch} [deps.fetchImpl] Injectable fetch (tests).
 * @param {() => number} [deps.now] Clock returning epoch SECONDS (tests).
 * @returns {() => Promise<string>} Resolves a fresh Bearer access token.
 */
export function createAccessTokenProvider({ account, fetchImpl = fetch, now = () => Date.now() / 1000 } = {}) {
  if (!account || !account.private_key || !account.client_email) {
    throw new Error('createAccessTokenProvider requires a parsed service account.');
  }

  let inFlight = null;
  let cached = null; // { token, expiresAtSec }

  async function mint() {
    const nowSec = Math.floor(now());
    if (cached && cached.expiresAtSec - TOKEN_SKEW_SEC > nowSec) {
      return cached.token;
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const assertion = await signAssertion(account, nowSec);
      const res = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
      });
      if (!res.ok) {
        // Surface no response body: it may echo request details.
        throw new Error(`Google token endpoint responded with ${res.status}.`);
      }
      const body = await res.json();
      if (!body || !body.access_token) {
        throw new Error('Google token endpoint returned no access_token.');
      }
      cached = {
        token: body.access_token,
        expiresAtSec: nowSec + Number(body.expires_in || TOKEN_LIFETIME_SEC),
      };
      return cached.token;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  return mint;
}
