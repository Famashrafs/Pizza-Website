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
// Revocation (parity with Admin SDK's verifyIdToken(token, /* checkRevoked *\/):
// after signature verification the token is checked against Identity Toolkit
// accounts:lookup, the same endpoint the Admin SDK uses. A deleted/disabled
// user's token is rejected even while the JWT would otherwise still be valid.
//
// Endpoint (see the Identity Toolkit v1 discovery document):
//
//   POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=<WEB_API_KEY>
//   body: { "idToken": "<id token>" }  ->  { "users": [ ... ] }
//
// The project-scoped sibling `POST /v1/projects/{targetProjectId}/accounts:lookup`
// is the ADMIN variant: Google documents it for requests "bearing a Google
// OAuth 2.0 credential with proper permissions" (i.e. a service account). An
// API key cannot authorize it — the request came back 401/403 and EVERY
// checkout failed with "Your session is invalid or has expired." even though
// the ID token was perfectly valid. The end-user endpoint above is the one
// that matches an API-key-authenticated revocation check.
//
// Diagnostics: a failed lookup logs ONLY the HTTP status and a sanitized,
// machine-readable error code (e.g. INVALID_ID_TOKEN). The ID token, the API
// key, the Authorization header, the request body and the request URL (which
// carries the API key) are never logged.

'use strict';

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { UpstreamUnavailableError } from './errors.js';

const DEFAULT_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const LOOKUP_URL_BASE = 'https://identitytoolkit.googleapis.com/v1';

// Identity Toolkit reason codes that describe the TOKEN (not the service).
// They are recognised for their meaning; any other well-formed code is still
// safe to log (it is a machine token, never a sentence).
const TOKEN_ERROR_CODES = [
  'INVALID_ID_TOKEN',
  'TOKEN_EXPIRED',
  'USER_NOT_FOUND',
  'USER_DISABLED',
  'CREDENTIAL_TOO_OLD_LARGE',
  'INVALID_TOKEN',
];

// Reason codes that describe the SERVICE/REQUEST (not the token): the API key
// is missing/rejected, the endpoint needs an OAuth2 credential, the provider
// is not configured, … These must never be reported to the customer as
// "your session expired".
const SERVICE_ERROR_CODES = [
  'API_KEY_INVALID',
  'INSUFFICIENT_PERMISSION',
  'OPERATION_NOT_ALLOWED',
  'PERMISSION_DENIED',
  'UNAUTHENTICATED',
];

export function isTokenErrorCode(code) {
  return TOKEN_ERROR_CODES.includes(code);
}

function defaultLogDiagnostic(entry) {
  console.warn('[firebase-auth]', JSON.stringify(entry));
}

// Reduces an Identity Toolkit error body to a safe, machine-readable code.
// Only a KNOWN code is ever returned — never a free-form message, never
// anything derived from the token, the API key or the request body.
export function sanitizeLookupErrorCode(body) {
  const error = body && typeof body === 'object' && body.error ? body.error : null;
  const message = error && typeof error.message === 'string' ? error.message : '';
  const status = error && typeof error.status === 'string' ? error.status : '';

  // A wrong/revoked API key reads "API key not valid. Please pass a valid API key."
  if (/api[_ ]?key/i.test(message)) return 'API_KEY_INVALID';

  // Identity Toolkit returns the specific reason as the first token of the
  // message, e.g. "INVALID_ID_TOKEN : The user's credential is no longer valid."
  const head = message.split(':')[0].trim().toUpperCase();
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(head) && head.length <= 40) {
    return head;
  }

  // Fall back to the canonical Google status (UNAUTHENTICATED, PERMISSION_DENIED…).
  if (/^[A-Z][A-Z_]{2,40}$/.test(status)) return status;

  return 'UNKNOWN';
}

// A failure of the SERVICE (bad key, wrong endpoint, quota, outage) is not a
// bad session: it must never be reported to the customer as "session expired".
function isServiceFailure(status, code) {
  if (status === 401 || status === 403) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  if (SERVICE_ERROR_CODES.includes(code)) return true;
  return false;
}

/**
 * Build a token verifier for one Firebase project.
 *
 * @param {object} deps
 * @param {string} deps.projectId Firebase project id (token audience).
 * @param {string} [deps.apiKey] Firebase web API key (public) for accounts:lookup.
 * @param {string} [deps.jwksUrl] Override for tests.
 * @param {string} [deps.lookupUrlBase] Override for tests.
 * @param {typeof fetch} [deps.fetchImpl] Injectable fetch (tests).
 * @param {(entry: object) => void} [deps.logDiagnostic] Diagnostic sink (tests).
 * @returns {(idToken: string) => Promise<object>} Resolves the verified payload.
 */
export function createVerifyIdToken({
  projectId,
  apiKey = '',
  jwksUrl = DEFAULT_JWKS_URL,
  lookupUrlBase = LOOKUP_URL_BASE,
  fetchImpl = fetch,
  logDiagnostic = defaultLogDiagnostic,
} = {}) {
  if (!projectId) throw new Error('createVerifyIdToken requires a projectId.');

  // Module-scope-per-instance JWK set: jose caches the keys in memory with a
  // cooldown, so each isolate re-fetches the JWKS at most every ~10 minutes.
  // Tests point jwksUrl at a local key server instead.
  const jwks = createRemoteJWKSet(new URL(jwksUrl));

  // Revocation / user-existence check (parity with verifyIdToken(t, true)).
  // Only possible with the (public) web API key; without it the signature +
  // claim verification above still applies and expired/forged tokens are still
  // rejected.
  async function assertUserExists(token) {
    const url = `${lookupUrlBase}/accounts:lookup?key=${encodeURIComponent(apiKey)}`;

    let lookup;
    try {
      lookup = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });
    } catch {
      // Network/DNS/TLS failure. The URL is never logged (it carries the API
      // key) and neither is the error message (it may echo the URL).
      logDiagnostic({
        stage: 'accounts:lookup',
        outcome: 'unreachable',
        code: 'LOOKUP_UNREACHABLE',
      });
      throw new UpstreamUnavailableError('Identity Toolkit lookup could not be reached.');
    }

    const body = await lookup.json().catch(() => null);

    if (!lookup.ok) {
      const code = sanitizeLookupErrorCode(body);
      logDiagnostic({
        stage: 'accounts:lookup',
        outcome: 'rejected',
        status: lookup.status,
        code,
      });
      if (isServiceFailure(lookup.status, code)) {
        throw new UpstreamUnavailableError(
          `Identity Toolkit lookup failed (${lookup.status}, ${code}).`
        );
      }
      // 400 with a token reason: the token itself is the problem — reject it
      // exactly like verifyIdToken(t, true) would.
      throw new Error(`Token lookup failed (${lookup.status}, ${code}).`);
    }

    if (!body || !Array.isArray(body.users) || !body.users.length) {
      logDiagnostic({
        stage: 'accounts:lookup',
        outcome: 'no_user',
        status: lookup.status,
        code: 'USER_NOT_FOUND',
      });
      throw new Error('Token lookup returned no user.');
    }

    logDiagnostic({
      stage: 'accounts:lookup',
      outcome: 'ok',
      status: lookup.status,
      code: 'OK',
    });
  }

  return async function verifyIdToken(idToken) {
    const token = String(idToken || '').trim();
    if (!token) throw new Error('Missing ID token.');

    // 1) signature, 2) issuer, 3) audience, 4) expiry
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: 60,
    });

    // 5) subject
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new Error('Token has no subject (uid).');
    }

    // 6) revocation / user existence
    if (apiKey) {
      await assertUserExists(token);
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
