// Tests for the free-tier demo HTTP API (server/app.js).
//
// These run WITHOUT Firebase: the order engine and the ID-token verifier are
// injected doubles, so they pin the transport contract the client gateway and
// the shared engine both depend on:
//
//   - identity is derived from the verified Bearer token, never the body,
//   - CORS reflects a fixed allowlist (no wildcard with credentials),
//   - health/diagnostics expose no secrets or customer data,
//   - failures are generic (no stack traces / internals leak to clients),
//   - there is no unauthenticated order-mutation surface.
//
// Run: npm run test:server

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp, parseAllowedOrigins } = require('../app');

const GOOD_TOKEN = 'good-token';

function makeContext(overrides = {}) {
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
  };

  if (overrides.orderService) {
    Object.assign(orderService, overrides.orderService);
  }

  const verifyToken =
    overrides.verifyToken ||
    (async (token) => {
      if (token === GOOD_TOKEN) {
        return { uid: 'token-uid', firebase: { sign_in_provider: 'anonymous' } };
      }
      throw new Error('bad token');
    });

  const app = createApp({
    orderService,
    verifyToken,
    allowedOrigins: overrides.allowedOrigins || 'http://localhost:3000,https://app.example',
    mode: 'demo',
    projectId: 'resturent-system',
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    logError: () => {},
  });

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, calls, orderService, app };
}

async function withContext(overrides, run) {
  const ctx = makeContext(overrides);
  try {
    await run(ctx);
  } finally {
    await new Promise((resolve) => ctx.server.close(resolve));
  }
}

// ---------------------------------------------------------------------------

test('GET /health reports a healthy, secret-free status', async () => {
  await withContext({}, async ({ base }) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'pizza-demo-api');
    assert.equal(body.mode, 'demo');
    assert.ok(!('FIREBASE_SERVICE_ACCOUNT_JSON' in body));
  });
});

test('GET /api/diagnostics exposes feature flags but never secrets', async () => {
  await withContext({}, async ({ base }) => {
    const res = await fetch(`${base}/api/diagnostics`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.transport, 'http-api');
    assert.equal(body.projectId, 'resturent-system');
    assert.deepEqual(body.features, {
      createOrder: true,
      guestLookup: true,
      payment: ['cash'],
    });

    const raw = JSON.stringify(body);
    assert.ok(!/private_key|serviceAccount|client_email|BEGIN PRIVATE KEY/i.test(raw));
  });
});

test('CORS preflight reflects an allowlisted origin (not a wildcard)', async () => {
  await withContext({}, async ({ base }) => {
    const res = await fetch(`${base}/api/orders/create`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.match(res.headers.get('access-control-allow-headers') || '', /authorization/i);
    assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
  });
});

test('CORS rejects a non-allowlisted origin with no credentials header', async () => {
  await withContext({}, async ({ base }) => {
    const res = await fetch(`${base}/api/orders/create`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST',
      },
    });

    assert.equal(res.status, 403);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });
});

test('POST /api/orders/create requires a Bearer token', async () => {
  await withContext({}, async ({ base, calls }) => {
    const res = await fetch(`${base}/api/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(calls.create.length, 0);
  });
});

test('POST /api/orders/create rejects an invalid token without calling the engine', async () => {
  await withContext({}, async ({ base, calls }) => {
    const res = await fetch(`${base}/api/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bad-token' },
      body: JSON.stringify({ items: [] }),
    });

    assert.equal(res.status, 401);
    assert.match((await res.json()).error, /session is invalid|expired/i);
    assert.equal(calls.create.length, 0);
  });
});

test('identity comes from the verified token, never the request body', async () => {
  await withContext({}, async ({ base, calls }) => {
    const res = await fetch(`${base}/api/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GOOD_TOKEN}` },
      body: JSON.stringify({ customerId: 'victim-uid', customerType: 'customer', items: [] }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order.customerId, 'token-uid');
    assert.equal(calls.create.length, 1);
    assert.equal(calls.create[0].auth.uid, 'token-uid');
    // The body is passed verbatim; the engine (not the transport) ignores the
    // spoofed identity fields.
    assert.equal(calls.create[0].data.customerId, 'victim-uid');
  });
});

test('POST /api/orders/guest-lookup needs no account, only the token body', async () => {
  await withContext({}, async ({ base, calls }) => {
    const res = await fetch(`${base}/api/orders/guest-lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ORD-9', token: 'capability' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.order.id, 'ORD-9');
    assert.equal(calls.lookup.length, 1);
  });
});

test('there is no unauthenticated admin/order-mutation surface', async () => {
  await withContext({}, async ({ base }) => {
    for (const [method, path] of [
      ['PATCH', '/api/orders/ORD-1/status'],
      ['PUT', '/api/orders/ORD-1'],
      ['POST', '/api/admin/orders'],
      ['DELETE', '/api/orders/ORD-1'],
    ]) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: 'delivered' }),
      });
      assert.equal(res.status, 404, `${method} ${path} should not exist`);
    }
  });
});

test('malformed JSON is a generic 400 with no parser internals', async () => {
  await withContext({}, async ({ base }) => {
    const res = await fetch(`${base}/api/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GOOD_TOKEN}` },
      body: '{ not json',
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(!/SyntaxError|Unexpected token|position/i.test(JSON.stringify(body)));
  });
});

test('an engine failure becomes a generic 500 and is logged internally', async () => {
  await withContext(
    {
      orderService: {
        async createOrder() {
          throw new Error('db down at internal-host:9999');
        },
        async getGuestOrder() {
          return { success: false };
        },
      },
    },
    async ({ base }) => {
      const res = await fetch(`${base}/api/orders/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GOOD_TOKEN}` },
        body: JSON.stringify({ items: [] }),
      });

      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.error, /encountered an error/i);
      assert.ok(!/internal-host|9999/.test(JSON.stringify(body)));
    }
  );
});

// --- Helpers ---------------------------------------------------------------

test('parseAllowedOrigins falls back to local dev origins and normalizes', () => {
  assert.deepEqual(parseAllowedOrigins(''), [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);
  assert.deepEqual(parseAllowedOrigins(' https://a.example/ , http://b.example '), [
    'https://a.example',
    'http://b.example',
  ]);
});
