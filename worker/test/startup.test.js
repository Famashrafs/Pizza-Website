// Startup / resilience tests for the Cloudflare Worker entry point.
//
// Regression coverage for the production "Error 1101" incident: the Worker
// answered EVERY route (including /health) with Cloudflare's generic 1101
// page because the Firebase stack was built inside the request path with no
// error handling. The 1101 page carries no CORS headers, so the browser only
// ever saw "CORS preflight failed".
//
// Invariants pinned here:
//   - the Worker never lets an exception escape `fetch` (no 1101),
//   - /health and /api/diagnostics work WITHOUT any Firebase configuration and
//     without initialising (or calling) Firebase,
//   - a broken deployment is reported as a generic 503 with CORS headers and a
//     safe, machine-readable reason — never as a crash and never with secret
//     material in the body,
//   - CORS preflight works for allowed origins even while Firebase is broken,
//   - a disallowed origin is still rejected (403) and never gets CORS headers.

import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { createWorkerEntrypoint } from '../src/index.js';

const ORIGIN = 'http://localhost:3000';
const SECRET = 'super-secret-private-key-material';

function env(overrides = {}) {
  return {
    FIREBASE_PROJECT_ID: 'resturent-system',
    FIREBASE_WEB_API_KEY: 'test-web-key',
    DEMO_MODE: 'demo',
    CORS_ALLOWED_ORIGINS: `${ORIGIN},http://127.0.0.1:3000`,
    ...overrides,
  };
}

const get = (handler, path, headers = {}) =>
  handler.fetch(
    new Request(`https://api.test${path}`, { method: 'GET', headers }),
    env()
  );

const post = (handler, path, { headers = {}, body = {} } = {}) =>
  handler.fetch(
    new Request(`https://api.test${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    env()
  );

const options = (handler, path, origin) =>
  handler.fetch(
    new Request(`https://api.test${path}`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    }),
    env()
  );

// A fresh entry point per test = fresh per-isolate cache.
const fresh = () => createWorkerEntrypoint();

// ---------------------------------------------------------------------------
// Health / diagnostics: alive, cheap and independent of Firebase
// ---------------------------------------------------------------------------

test('GET /health answers 200 even with no Firebase configuration', async () => {
  const handler = fresh();
  const res = await get(handler, '/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.service, 'pizza-demo-api');
  assert.equal(body.status, 'degraded');
  assert.equal(body.dependencies.firebase.state, 'error');
  assert.equal(body.dependencies.firebase.code, 'service_account_missing');
});

test('GET /health reports invalid JSON in the secret without leaking it', async () => {
  const handler = fresh();
  const res = await handler.fetch(
    new Request('https://api.test/health'),
    env({ FIREBASE_SERVICE_ACCOUNT_JSON: '{not-json' })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.dependencies.firebase.code, 'service_account_invalid_json');
  assert.equal(JSON.stringify(body).includes('{not-json'), false);
});

test('GET /health reports an incomplete service account', async () => {
  const handler = fresh();
  const res = await handler.fetch(
    new Request('https://api.test/health'),
    env({ FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"p"}' })
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.dependencies.firebase.code, 'service_account_invalid_shape');
});

test('GET /health and /api/diagnostics never expose the secret', async () => {
  const handler = fresh();
  const res = await handler.fetch(
    new Request('https://api.test/api/diagnostics'),
    env({ FIREBASE_SERVICE_ACCOUNT_JSON: `{"project_id":"p","private_key":"${SECRET}","client_email":"a@b.c"}` })
  );
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.includes('private_key'), false);
  const body = JSON.parse(text);
  assert.equal(body.dependencies.firebase.state, 'configured');
  assert.equal(body.transport, 'http-api');
});

test('GET /api/diagnostics stays 200 while the deployment is broken', async () => {
  const handler = fresh();
  const res = await get(handler, '/api/diagnostics');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'degraded');
  assert.equal(body.dependencies.firebase.code, 'service_account_missing');
});

// ---------------------------------------------------------------------------
// Order routes: a broken deployment is a 503, never a crash (1101)
// ---------------------------------------------------------------------------

test('POST /api/orders/create with missing credentials returns 503 + CORS', async () => {
  const handler = fresh();
  const res = await post(handler, '/api/orders/create', {
    headers: { Origin: ORIGIN, Authorization: 'Bearer token' },
    body: { items: [] },
  });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error, 'The order service is temporarily unavailable. Please try again.');
});

test('POST /api/orders/guest-lookup with broken credentials returns 503 + CORS', async () => {
  const handler = fresh();
  const res = await post(handler, '/api/orders/guest-lookup', {
    headers: { Origin: ORIGIN },
    body: { orderId: 'x' },
  });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
});

test('an order request never leaks the secret in the error body', async () => {
  const handler = fresh();
  const res = await handler.fetch(
    new Request('https://api.test/api/orders/guest-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ orderId: 'x' }),
    }),
    env({ FIREBASE_SERVICE_ACCOUNT_JSON: SECRET })
  );
  assert.equal(res.status, 503);
  const text = await res.text();
  assert.equal(text.includes(SECRET), false);
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

test('OPTIONS preflight for an allowed origin is 204 + CORS, even when broken', async () => {
  const handler = fresh();
  const res = await options(handler, '/api/orders/create', ORIGIN);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.ok(res.headers.get('access-control-allow-methods').includes('POST'));
  assert.ok(res.headers.get('access-control-allow-headers').includes('Authorization'));
});

test('OPTIONS preflight for a disallowed origin is 403 without CORS headers', async () => {
  const handler = fresh();
  const res = await options(handler, '/api/orders/create', 'https://evil.example');
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('a request from a disallowed origin is rejected, not served', async () => {
  const handler = fresh();
  const res = await get(handler, '/health', { Origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('error responses for allowed origins still carry CORS headers', async () => {
  const handler = fresh();
  const res = await post(handler, '/api/orders/create', {
    headers: { Origin: ORIGIN, Authorization: 'Bearer token' },
    body: {},
  });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(res.headers.get('vary'), 'Origin');
});

// ---------------------------------------------------------------------------
// No uncaught exception may escape `fetch` (Cloudflare Error 1101)
// ---------------------------------------------------------------------------

test('an unexpected internal failure becomes a JSON 500, not an exception', async () => {
  const handler = fresh();
  // A broken env makes the transport construction fail inside the request.
  const res = await handler.fetch(
    new Request('https://api.test/health', { headers: { Origin: ORIGIN } }),
    undefined
  );
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error, 'The order server encountered an error.');
});

test('the default export exposes a fetch handler', () => {
  assert.equal(typeof worker.fetch, 'function');
});
