// Transport-contract tests for the Cloudflare Worker API (worker/src/app.js).
//
// These run the REAL handler against injected doubles (order engine + token
// verifier), pinning the SAME contract as server/test/app.test.js so both
// transports stay interchangeable:
//
//   - identity is derived from the verified Bearer token (`sub`), never the body,
//   - CORS reflects a fixed allowlist (no wildcard), preflight included,
//   - health/diagnostics expose no secrets or customer data,
//   - failures are generic (no internals leak to clients),
//   - there is no unauthenticated order-mutation surface.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../src/app.js';

const GOOD_TOKEN = 'good-token';

function makeApp(overrides = {}) {
  const calls = { create: [], lookup: [] };

  const orderService = {
    async createOrder(arg) {
      calls.create.push(arg);
      return {
        success: true,
        reuse: false,
        orderId: 'ORD-1',
        order: {
          id: 'ORD-1',
          customerId: arg.auth.uid,
          customerType: arg.data.customerType,
        },
      };
    },
    async getGuestOrder(arg) {
      calls.lookup.push(arg);
      return { success: true, order: { id: arg.data.orderId, customerId: 'guest-1' } };
    },
    ...(overrides.orderService || {}),
  };

  const verifyToken =
    overrides.verifyToken ||
    (async (token) => {
      if (token === GOOD_TOKEN) {
        return { sub: 'token-uid', firebase: { sign_in_provider: 'anonymous' } };
      }
      throw new Error('bad token');
    });

  const handle = createWorkerApp({
    orderService,
    verifyToken,
    allowedOrigins: overrides.allowedOrigins || 'http://localhost:3000,https://app.example',
    mode: 'demo',
    projectId: 'resturent-system',
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    logError: () => {},
  });

  return { handle, calls };
}

const get = (handle, path, headers = {}) =>
  handle(new Request(`https://api.test${path}`, { method: 'GET', headers }));

const post = (handle, path, { headers = {}, body } = {}) =>
  handle(
    new Request(`https://api.test${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    })
  );

// ---------------------------------------------------------------------------

test('GET /health reports a healthy, secret-free status', async () => {
  const { handle } = makeApp();
  const res = await get(handle, '/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'pizza-demo-api');
  assert.equal(body.mode, 'demo');
  assert.ok(!('FIREBASE_SERVICE_ACCOUNT_JSON' in body));
});

test('GET /api/diagnostics exposes feature flags but never secrets', async () => {
  const { handle } = makeApp();
  const res = await get(handle, '/api/diagnostics');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.transport, 'http-api');
  assert.equal(body.runtime, 'cloudflare-workers');
  assert.equal(body.projectId, 'resturent-system');
  assert.deepEqual(body.features, { createOrder: true, guestLookup: true, payment: ['cash'] });

  const raw = JSON.stringify(body);
  assert.ok(!/private_key|serviceAccount|client_email|BEGIN PRIVATE KEY/i.test(raw));
});

test('CORS preflight reflects an allowlisted origin (not a wildcard)', async () => {
  const { handle } = makeApp();
  const res = await handle(
    new Request('https://api.test/api/orders/create', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    })
  );

  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.match(res.headers.get('access-control-allow-headers') || '', /authorization/i);
  assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
});

test('CORS rejects a non-allowlisted origin with no CORS headers', async () => {
  const { handle } = makeApp();
  const res = await handle(
    new Request('https://api.test/api/orders/create', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    })
  );

  assert.equal(res.status, 403);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await res.json(), { success: false, error: 'Origin not allowed.' });
});

test('CORS headers are attached to normal responses for allowed origins', async () => {
  const { handle } = makeApp();
  const res = await get(handle, '/health', { Origin: 'https://app.example' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://app.example');
  assert.equal(res.headers.get('vary'), 'Origin');
});

test('POST /api/orders/create requires a Bearer token', async () => {
  const { handle, calls } = makeApp();
  const res = await post(handle, '/api/orders/create', { body: { items: [] } });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).success, false);
  assert.equal(calls.create.length, 0);
});

test('POST /api/orders/create rejects invalid and expired tokens without calling the engine', async () => {
  const { handle, calls } = makeApp();
  for (const token of ['expired-token', 'tampered.signature.value', 'garbage']) {
    const res = await post(handle, '/api/orders/create', {
      headers: { Authorization: `Bearer ${token}` },
      body: { items: [] },
    });
    assert.equal(res.status, 401, `token ${token}`);
    assert.match((await res.json()).error, /session is invalid|expired/i);
  }
  assert.equal(calls.create.length, 0);
});

test('identity comes from the verified token, never the request body', async () => {
  const { handle, calls } = makeApp();
  const res = await post(handle, '/api/orders/create', {
    headers: { Authorization: `Bearer ${GOOD_TOKEN}` },
    body: { customerId: 'victim-uid', customerType: 'customer', items: [] },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.order.customerId, 'token-uid');
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].auth.uid, 'token-uid');
  // The engine (not the transport) ignores spoofed identity fields.
  assert.equal(calls.create[0].data.customerId, 'victim-uid');
});

test('POST /api/orders/guest-lookup needs no account, only the token body', async () => {
  const { handle, calls } = makeApp();
  const res = await post(handle, '/api/orders/guest-lookup', {
    body: { orderId: 'ORD-9', token: 'capability' },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.order.id, 'ORD-9');
  assert.equal(calls.lookup.length, 1);
});

test('there is no unauthenticated admin/order-mutation surface', async () => {
  const { handle } = makeApp();
  for (const [method, path] of [
    ['PATCH', '/api/orders/ORD-1/status'],
    ['PUT', '/api/orders/ORD-1'],
    ['POST', '/api/admin/orders'],
    ['DELETE', '/api/orders/ORD-1'],
  ]) {
    const res = await handle(
      new Request(`https://api.test${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: 'delivered' }),
      })
    );
    assert.equal(res.status, 404, `${method} ${path} should not exist`);
  }
});

test('malformed JSON is a generic 400 with no parser internals', async () => {
  const { handle } = makeApp();
  const res = await post(handle, '/api/orders/create', {
    headers: { Authorization: `Bearer ${GOOD_TOKEN}` },
    body: '{ not json',
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(!/SyntaxError|Unexpected token|position/i.test(JSON.stringify(body)));
});

test('an oversized body is rejected with a generic 413', async () => {
  const { handle } = makeApp();
  const big = JSON.stringify({ items: [], blob: 'x'.repeat(110 * 1024) });
  const res = await post(handle, '/api/orders/create', {
    headers: { Authorization: `Bearer ${GOOD_TOKEN}` },
    body: big,
  });
  assert.equal(res.status, 413);
  assert.equal((await res.json()).success, false);
});

test('an engine failure becomes a generic 500 and is logged internally', async () => {
  const logged = [];
  const handle = createWorkerApp({
    orderService: {
      async createOrder() {
        throw new Error('db down at internal-host:9999');
      },
      async getGuestOrder() {
        return { success: false };
      },
    },
    verifyToken: async () => ({ sub: 'u1', firebase: {} }),
    allowedOrigins: 'http://localhost:3000',
    logError: (err) => logged.push(err.message),
  });

  const res = await post(handle, '/api/orders/create', {
    headers: { Authorization: `Bearer ${GOOD_TOKEN}` },
    body: { items: [] },
  });

  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.match(body.error, /encountered an error/i);
  assert.ok(!/internal-host|9999/.test(JSON.stringify(body)));
  assert.deepEqual(logged, ['db down at internal-host:9999']);
});
