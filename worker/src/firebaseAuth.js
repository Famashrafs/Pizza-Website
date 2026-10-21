// Firebase ID-token verification for Cloudflare Workers.
//
// The Firebase Admin SDK (verifyIdToken) cannot run on Workers, so this
// performs the SAME verification the Admin SDK performs, against the SAME
// trust root:
//
//   1. signature — RS256 against Google's public Secure Token keys
//      (https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com,
//      the JWK form of the x509 certs the Admin SDK fetches),
//   2. issuer    — https://securetoken.google.com/{projectId},
//   3. audience  — {projectId},
//   4. expiry    — with 60 s clock tolerance,
//   5. subject   — non-empty `sub` (the uid).
//
// Tokens are NEVER decoded-and-trusted: an unverified decode is worthless,
// and client-supplied identity in the request body is ignored by the engine.
// Anonymous guest sessions carry a normal ID token whose verified
// `firebase.sign_in_provider` claim is `anonymous` — the engine reads that
// claim from THIS verified payload, never from the client.
//
// Revocation (parity with Admin SDK's verifyIdToken(token, /* checkRevoked *\/)):
// after signature verification the token is checked against Identity Toolkit
// accounts:lookup, the same endpoint the Admin SDK uses. A deleted/disabled
// user's token is rejected even while the JWT would otherwise still be valid.

'use strict';

import { createRemoteJWKSet, jwtVerify } from 'jose';

const DEFAULT_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/projects';

/**
 * Build a token verifier for one Firebase project.
 *
 * @param {object} deps
 * @param {string} deps.projectId Firebase project id (token audience).
 * @param {string} [deps.apiKey] Firebase web API key (public) for accounts:lookup.
 * @param {string} [deps.jwksUrl] Override for tests.
 * @param {string} [deps.lookupUrlBase] Override for tests.
 * @param {typeof fetch} [deps.fetchImpl] Injectable fetch (tests).
 * @returns {(idToken: string) => Promise<object>} Resolves the verified payload.
 */
export function createVerifyIdToken({
  projectId,
  apiKey = '',
  jwksUrl = DEFAULT_JWKS_URL,
  lookupUrlBase = LOOKUP_URL,
  fetchImpl = fetch,
} = {}) {
  if (!projectId) throw new Error('createVerifyIdToken requires a projectId.');

  // Module-scope-per-instance JWK set: jose caches the keys in memory with a
  // cooldown, so each isolate re-fetches the JWKS at most every ~10 minutes.
  // Tests point jwksUrl at a local key server instead.
  const jwks = createRemoteJWKSet(new URL(jwksUrl));

  return async function verifyIdToken(idToken) {
    const token = String(idToken || '').trim();
    if (!token) throw new Error('Missing ID token.');

    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: 60,
    });

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new Error('Token has no subject (uid).');
    }

    // Revocation / user-existence check. Only possible with the (public) web
    // API key; without it the signature + claim verification above still
    // applies and expired/forged tokens are still rejected.
    if (apiKey) {
      const lookup = await fetchImpl(
        `${lookupUrlBase}/${encodeURIComponent(projectId)}/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
        }
      );
      if (!lookup.ok) {
        // 401/404: token revoked, user deleted/disabled, or otherwise not
        // recognized — reject exactly like verifyIdToken(t, true) would.
        throw new Error(`Token lookup failed (${lookup.status}).`);
      }
      const body = await lookup.json().catch(() => null);
      if (!body || !Array.isArray(body.users) || !body.users.length) {
        throw new Error('Token lookup returned no user.');
      }
    }

    return payload;
  };
}

// The engine reads auth.token.firebase.sign_in_provider; expose the same
// helper shape the server uses so callers stay identical.
export function isAnonymousToken(payload) {
  return Boolean(
    payload && payload.firebase && payload.firebase.sign_in_provider === 'anonymous'
  );
}
