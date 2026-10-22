// Cloudflare Worker demo API — transport layer only (mirrors server/app.js).
//
// All order pricing, validation, idempotency and guest-token logic lives in
// the shared engine at `functions/lib/orderServiceCore.js`, injected as
// `orderService` — the SAME engine the Render/Express transport and the
// Firebase callables use. This file owns only:
//
//   - CORS with an explicit origin allowlist (never a wildcard),
//   - Firebase ID-token verification via an injected `verifyToken`,
//   - the JSON request/response contract the client gateway expects,
//   - health/diagnostic endpoints that expose no secrets or customer data.
//
// Security posture: identity is ALWAYS taken from the verified token, never
// from the request body. No admin mutation endpoints exist here — owner/admin
// order-status changes stay on Firestore Security Rules (see firestore.rules).

import {
  parseAllowedOrigins,
  isOriginAllowed,
  corsHeadersFor,
  bearerToken,
} from './cors.js';
import { isConfigurationError, isUpstreamUnavailable, safeErrorMessage } from './errors.js';

const API_VERSION = '2.5.0';
const MAX_BODY_BYTES = 100 * 1024; // matches express.json({ limit: '100kb' })

function json(status, headers, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * Build the Worker request handler.
 *
 * @param {object} deps
 * @param {{ createOrder: Function, getGuestOrder: Function }} deps.orderService
 *   Shared order engine (see functions/lib/orderServiceCore.js).
 * @param {(idToken: string) => Promise<object>} deps.verifyToken
 *   Verifies a Firebase ID token and resolves the verified payload.
 * @param {string|string[]} [deps.allowedOrigins] CORS allowlist.
 * @param {string} [deps.mode] Deployment mode label (e.g. "demo").
 * @param {string|null} [deps.projectId] Public Firebase project id (never secret).
 * @param {() => Date} [deps.now] Clock (injectable for tests).
 * @param {(err: Error) => void} [deps.logError] Internal error logger.
 * @param {() => { firebase: { state: string, code?: string } }} [deps.getServiceStatus]
 *   Reports the state of the Firebase-backed dependencies WITHOUT initialising
 *   them (used by /health and /api/diagnostics).
 * @returns {(request: Request) => Promise<Response>}
 */
export function createWorkerApp({
  orderService,
  verifyToken,
  allowedOrigins,
  mode = 'demo',
  projectId = null,
  now = () => new Date(),
  logError = (err) => console.error('[api]', safeErrorMessage(err)),
  getServiceStatus = () => ({ firebase: { state: 'unknown' } }),
} = {}) {
  if (!orderService || typeof orderService.createOrder !== 'function') {
    throw new Error('createWorkerApp requires an orderService with createOrder/getGuestOrder.');
  }
  if (typeof verifyToken !== 'function') {
    throw new Error('createWorkerApp requires a verifyToken function.');
  }

  const allowed = parseAllowedOrigins(allowedOrigins);

  return async function handleRequest(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // CORS: non-browser callers (health probes, curl, server-to-server) send
    // no Origin; CORS does not apply to them. Browser callers must match the
    // explicit allowlist.
    let corsHeaders = {};
    if (origin) {
      if (!isOriginAllowed(origin, allowed)) {
        return json(403, {}, { success: false, error: 'Origin not allowed.' });
      }
      corsHeaders = corsHeadersFor(origin);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // --- Health & diagnostics (no secrets, no customer data) --------------
      // Neither endpoint initialises Firebase, mints a token or touches
      // Firestore: they only report the CURRENT state of those dependencies so
      // a broken deployment is visible without a 1101-style crash.
      if (request.method === 'GET' && url.pathname === '/health') {
        const status = readServiceStatus(getServiceStatus);
        return json(
          200,
          corsHeaders,
          {
            status: status.firebase.state === 'error' ? 'degraded' : 'ok',
            service: 'pizza-demo-api',
            mode,
            dependencies: status,
            time: now().toISOString(),
          }
        );
      }

      if (request.method === 'GET' && url.pathname === '/api/diagnostics') {
        // Public, non-secret introspection only: project ids and feature flags
        // are already exposed to the browser via the Firebase web config.
        // Secrets, service-account material and customer data are never
        // included.
        const status = readServiceStatus(getServiceStatus);
        return json(
          200,
          corsHeaders,
          {
            status: status.firebase.state === 'error' ? 'degraded' : 'ok',
            service: 'pizza-demo-api',
            apiVersion: API_VERSION,
            mode,
            transport: 'http-api',
            runtime: 'cloudflare-workers',
            projectId: projectId || null,
            features: { createOrder: true, guestLookup: true, payment: ['cash'] },
            dependencies: status,
            time: now().toISOString(),
          }
        );
      }

      if (request.method === 'POST' && url.pathname === '/api/orders/create') {
        const token = bearerToken(request.headers.get('Authorization'));
        if (!token) {
          return json(
            401,
            corsHeaders,
            { success: false, error: 'You must be signed in to place an order.' }
          );
        }

        let decoded;
        try {
          decoded = await verifyToken(token);
        } catch (err) {
          // A broken deployment or an unavailable dependency (Identity Toolkit
          // outage, bad API key) is NOT a client problem: report it as 503,
          // never as "session expired".
          if (isConfigurationError(err) || isUpstreamUnavailable(err)) throw err;
          // Never surface why a token failed (expired/revoked/malformed).
          return json(
            401,
            corsHeaders,
            { success: false, error: 'Your session is invalid or has expired. Please sign in again.' }
          );
        }

        if (!decoded || !decoded.sub) {
          return json(
            401,
            corsHeaders,
            { success: false, error: 'Your session is invalid or has expired. Please sign in again.' }
          );
        }

        const body = await readJsonBody(request);
        if (body.error) {
          return json(body.status, corsHeaders, body.payload);
        }

        // Identity comes from the verified token ONLY. `body.data.customerId`,
        // `customerType` and any `role` are ignored by the server engine, so a
        // client can never impersonate another user or escalate privileges.
        // The engine reads anonymous vs registered from the verified
        // `firebase.sign_in_provider` claim.
        const auth = { uid: decoded.sub, token: decoded };
        const result = await orderService.createOrder({ data: body.value || {}, auth });
        return json(200, corsHeaders, result);
      }

      if (request.method === 'POST' && url.pathname === '/api/orders/guest-lookup') {
        const body = await readJsonBody(request);
        if (body.error) {
          return json(body.status, corsHeaders, body.payload);
        }
        const result = await orderService.getGuestOrder({ data: body.value || {} });
        return json(200, corsHeaders, result);
      }

      // --- No admin surface here --------------------------------------------
      // Order-status changes are performed by owners/customers directly against
      // Firestore, where firestore.rules enforce ownership and role.
      return json(404, corsHeaders, { success: false, error: 'Not found.' });
    } catch (err) {
      logError(err);
      if (isConfigurationError(err) || isUpstreamUnavailable(err)) {
        // Deployment/dependency problem, not a client problem. The message
        // stays generic (the machine-readable reason is logged server-side and
        // exposed via /api/diagnostics) but the response DOES carry CORS
        // headers so the browser can read it.
        return json(503, corsHeaders, {
          success: false,
          error: 'The order service is temporarily unavailable. Please try again.',
        });
      }
      return json(500, corsHeaders, {
        success: false,
        error: 'The order server encountered an error.',
      });
    }
  };
}

// Normalise the dependency report: never leak anything but a state name and a
// safe, machine-readable code.
function readServiceStatus(getServiceStatus) {
  let raw;
  try {
    raw = getServiceStatus();
  } catch {
    raw = null;
  }
  const firebase = raw && raw.firebase ? raw.firebase : {};
  const state = ['ready', 'configured', 'not_initialized', 'error'].includes(firebase.state)
    ? firebase.state
    : 'unknown';
  const status = { firebase: { state } };
  if (state === 'error' && typeof firebase.code === 'string' && firebase.code) {
    status.firebase.code = firebase.code;
  }
  return status;
}

// Bounded JSON body parsing: 100 KB cap (same as the Express transport),
// malformed JSON becomes the same generic 400.
async function readJsonBody(request) {
  const raw = await request.text().catch(() => '');
  if (raw.length > MAX_BODY_BYTES) {
    return {
      error: true,
      status: 413,
      payload: { success: false, error: 'The request could not be processed.' },
    };
  }
  if (!raw) return { value: {} };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        error: true,
        status: 400,
        payload: { success: false, error: 'The request could not be processed.' },
      };
    }
    return { value };
  } catch {
    return {
      error: true,
      status: 400,
      payload: { success: false, error: 'The request could not be processed.' },
    };
  }
}

export { API_VERSION };
