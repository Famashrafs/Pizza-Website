// Free-tier demo HTTP API (Express) — transport layer only.
//
// This is the Render-hosted stand-in for the Firebase callable transport while
// the project is on the free (Spark) plan. It is deliberately THIN: all order
// pricing, validation, idempotency and guest-token logic lives in the shared,
// unchanged engine at `functions/lib/orderServiceCore.js`, which is injected as
// `orderService`. This file owns only:
//
//   - CORS with an explicit origin allowlist (never a wildcard with credentials),
//   - Firebase ID-token verification via an injected `verifyToken` (Admin SDK),
//   - the JSON request/response contract the client gateway expects,
//   - health/diagnostic endpoints that expose no secrets or customer data.
//
// Security posture: identity is ALWAYS taken from the verified token, never
// from the request body. No admin mutation endpoints exist here — owner/admin
// order-status changes stay on Firestore Security Rules (see firestore.rules).

'use strict';

const express = require('express');

// Local development origins are always allowed. Production origins must be
// supplied through CORS_ALLOWED_ORIGINS (comma-separated), e.g. the Vercel URL.
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

const API_VERSION = '2.4.0';

function normalizeOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

// Accepts an array or a comma-separated string. Falls back to the local dev
// origins when nothing (or only blanks) is configured.
function parseAllowedOrigins(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  const list = raw.map(normalizeOrigin).filter(Boolean);
  return list.length ? list : DEFAULT_ALLOWED_ORIGINS.slice();
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return false;
  const origin_ = normalizeOrigin(origin);
  return allowedOrigins.some(
    (allowed) => allowed === origin_ || allowed === '*'
  );
}

function bearerToken(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header || '').trim());
  return match ? match[1].trim() : null;
}

/**
 * Build the Express application.
 *
 * @param {object} deps
 * @param {{ createOrder: Function, getGuestOrder: Function }} deps.orderService
 *   Shared order engine (see functions/lib/orderServiceCore.js).
 * @param {(idToken: string) => Promise<object>} deps.verifyToken
 *   Verifies a Firebase ID token and resolves the decoded token.
 * @param {string|string[]} [deps.allowedOrigins] CORS allowlist.
 * @param {string} [deps.mode] Deployment mode label (e.g. "demo").
 * @param {string|null} [deps.projectId] Public Firebase project id (never secret).
 * @param {() => Date} [deps.now] Clock (injectable for tests).
 * @param {(err: Error) => void} [deps.logError] Internal error logger.
 */
function createApp({
  orderService,
  verifyToken,
  allowedOrigins,
  mode = 'demo',
  projectId = null,
  now = () => new Date(),
  logError = (err) => console.error('[api]', err && err.message),
} = {}) {
  if (!orderService || typeof orderService.createOrder !== 'function') {
    throw new Error('createApp requires an orderService with createOrder/getGuestOrder.');
  }
  if (typeof verifyToken !== 'function') {
    throw new Error('createApp requires a verifyToken function.');
  }

  const allowed = parseAllowedOrigins(allowedOrigins);
  const app = express();
  app.disable('x-powered-by');

  // --- CORS (explicit allowlist; no wildcard-with-credentials) --------------
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    // Non-browser callers (health probes, curl, server-to-server) send no
    // Origin; CORS does not apply to them.
    if (!origin) return next();

    if (!isOriginAllowed(origin, allowed)) {
      return res.status(403).json({ success: false, error: 'Origin not allowed.' });
    }

    res.setHeader('Access-Control-Allow-Origin', normalizeOrigin(origin));
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });

  app.use(express.json({ limit: '100kb' }));

  // --- Health & diagnostics (no secrets, no customer data) ------------------
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'pizza-demo-api',
      mode,
      time: now().toISOString(),
    });
  });

  app.get('/api/diagnostics', (_req, res) => {
    // Public, non-secret introspection only: project ids and feature flags are
    // already exposed to the browser via the Firebase web config. Secrets,
    // service-account material and customer data are never included.
    res.status(200).json({
      status: 'ok',
      service: 'pizza-demo-api',
      apiVersion: API_VERSION,
      mode,
      transport: 'http-api',
      projectId: projectId || null,
      features: { createOrder: true, guestLookup: true, payment: ['cash'] },
      time: now().toISOString(),
    });
  });

  // --- Order creation (authenticated: registered OR anonymous guest) --------
  app.post('/api/orders/create', async (req, res, next) => {
    try {
      const token = bearerToken(req.headers.authorization);
      if (!token) {
        return res
          .status(401)
          .json({ success: false, error: 'You must be signed in to place an order.' });
      }

      let decoded;
      try {
        decoded = await verifyToken(token);
      } catch {
        // Never surface why a token failed (expired/revoked/malformed).
        return res.status(401).json({
          success: false,
          error: 'Your session is invalid or has expired. Please sign in again.',
        });
      }

      if (!decoded || !decoded.uid) {
        return res.status(401).json({
          success: false,
          error: 'Your session is invalid or has expired. Please sign in again.',
        });
      }

      // Identity comes from the verified token ONLY. `req.body.customerId`,
      // `customerType` and any `role` are ignored by the server engine, so a
      // client can never impersonate another user or escalate privileges.
      const auth = { uid: decoded.uid, token: decoded };
      const result = await orderService.createOrder({ data: req.body || {}, auth });
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });

  // --- Guest order lookup (capability token; no account required) -----------
  app.post('/api/orders/guest-lookup', async (req, res, next) => {
    try {
      const result = await orderService.getGuestOrder({ data: req.body || {} });
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });

  // --- No admin surface here ------------------------------------------------
  // Order-status changes are performed by owners/customers directly against
  // Firestore, where firestore.rules enforce ownership and role. There is
  // intentionally no HTTP endpoint that can mutate an order without those rules.
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Not found.' });
  });

  // --- Error handler: log internally, return a generic message --------------
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    logError(err);
    const status = Number(err && (err.status || err.statusCode)) || 500;
    if (status >= 400 && status < 500) {
      return res
        .status(status)
        .json({ success: false, error: 'The request could not be processed.' });
    }
    return res
      .status(500)
      .json({ success: false, error: 'The order server encountered an error.' });
  });

  return app;
}

module.exports = {
  createApp,
  parseAllowedOrigins,
  isOriginAllowed,
  bearerToken,
  normalizeOrigin,
  DEFAULT_ALLOWED_ORIGINS,
  API_VERSION,
};
