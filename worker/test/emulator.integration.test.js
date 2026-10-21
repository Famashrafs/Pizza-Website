// REAL Firestore emulator integration test for the Worker's REST adapter +
// shared order engine (the same stack the Cloudflare Worker runs).
//
// Skipped automatically unless FIRESTORE_EMULATOR_HOST is set — run via:
//
//   npm run test:worker:emulator
//
// (which wraps `firebase emulators:exec`, exporting the env var for this
// process). This exercises REAL Firestore REST transaction semantics —
// beginTransaction / transactional reads / commit conflicts — not a mock.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../src/app.js';
import { createOrderService } from '../../functions/lib/orderServiceCore.js';
import { createFirestore, serverTimestamp } from '../src/firestore.js';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || null;
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-worker-test';
const RESTAURANT_ID = 'restaurant-pizza-demo';

const opts = { skip: !EMULATOR_HOST && 'FIRESTORE_EMULATOR_HOST not set (run via npm run test:worker:emulator)' };

test('emulator: full guest checkout + idempotent replay + guest lookup', opts, async () => {
  const db = createFirestore({
    projectId: PROJECT,
    getAccessToken: async () => 'owner',
    emulatorHost: EMULATOR_HOST,
    // TEMP diagnostic: dump the request body the emulator rejected.
    fetchImpl: async (url, init) => {
      const res = await fetch(url, init);
      if (!res.ok && url.includes(':commit')) {
        console.log('[rejected commit body]', init.body);
        console.log('[rejected commit response]', res.status, await res.clone().text());
      }
      return res;
    },
  });

  // Seed through the adapter's own transport (plain REST writes via a
  // transaction-free path: use the Admin-compatible documents API directly).
  const base = `http://${EMULATOR_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
  const put = (path, fields) =>
    fetch(`${base}/${path}`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer owner',
        'Content-Type': 'application/json',
        Connection: 'close', // avoid keep-alive reuse races with the emulator
      },
      body: JSON.stringify({ fields }),
    });

  const s = (v) => ({ stringValue: v });
  const n = (v) => ({ integerValue: String(v) });
  const d = (v) => ({ doubleValue: v });
  const arr = (values) => ({ arrayValue: { values } });
  const map = (fields) => ({ mapValue: { fields } });

  await put(`restaurants/${RESTAURANT_ID}`, {
    taxRate: d(0.08),
    minOrder: n(0),
    deliveryFee: d(3.99),
    freeDeliveryThreshold: d(35),
    deliveryEnabled: { booleanValue: true },
  });
  await put('products/pizza-1', {
    restaurantId: s(RESTAURANT_ID),
    name: s('Margherita'),
    image: s('pizza.jpg'),
    basePrice: d(8),
    available: { booleanValue: true },
    defaultSize: s('Medium'),
    sizes: arr([
      map({ label: s('Small'), adjust: d(-1) }),
      map({ label: s('Medium'), adjust: d(0) }),
      map({ label: s('Large'), adjust: d(3) }),
    ]),
    defaultCrust: s('thin'),
    crusts: arr([
      map({ id: s('thin'), label: s('Thin'), price: d(0), available: { booleanValue: true } }),
      map({ id: s('pan'), label: s('Pan'), price: d(2), available: { booleanValue: true } }),
    ]),
    toppings: arr([
      map({ id: s('cheese'), name: s('Extra cheese'), price: d(1.5), available: { booleanValue: true } }),
    ]),
    maxToppings: n(3),
  });

  const orderService = createOrderService({ db, serverTimestamp });
  const handle = createWorkerApp({
    orderService,
    verifyToken: async (token) => {
      if (token !== 'emulator-guest') throw new Error('bad token');
      return { sub: 'emulator-guest-uid', firebase: { sign_in_provider: 'anonymous' } };
    },
    allowedOrigins: 'http://localhost:3000',
    mode: 'demo',
    projectId: PROJECT,
    logError: (err) => {
      let line = `[emulator-test] ${err && err.message}`;
      for (let c = err && err.cause; c; c = c.cause) {
        line += ` | cause: ${c.code || c.constructor.name} ${c.message || String(c)}`;
      }
      console.error(line, err && err.stack);
    },
  });

  const payload = {
    restaurantId: RESTAURANT_ID,
    idempotencyKey: 'emul-chk-1',
    items: [
      {
        productId: 'pizza-1',
        qty: 2,
        price: 0.01, // tampered — must be ignored
        config: { sizeLabel: 'Large', crustId: 'pan', toppingIds: ['cheese'], instructions: '' },
      },
    ],
    customer: { fullName: 'Emu Guest', email: 'emu@example.com', phone: '5551234567' },
    fulfillmentType: 'delivery',
    address: { street: '1 Main St', city: 'Springfield', phone: '5551234567' },
    paymentMethod: 'cash',
    total: 0.01, // tampered
  };

  const post = (path, body, token) =>
    handle(
      new Request(`https://api.test${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
    );

  const created = await (await post('/api/orders/create', payload, 'emulator-guest')).json();
  assert.equal(created.success, true, JSON.stringify(created));
  assert.equal(created.order.items[0].unitPrice, 14.5);
  assert.equal(created.order.total, 35.31);
  assert.equal(created.order.customerId, 'emulator-guest-uid');
  assert.ok(created.trackingToken);

  // Replay: same key + same payload → same order (REAL transaction semantics).
  const replayed = await (await post('/api/orders/create', payload, 'emulator-guest')).json();
  assert.equal(replayed.success, true);
  assert.equal(replayed.reuse, true);
  assert.equal(replayed.orderId, created.orderId);

  // Guest lookup with the (rotated) token; hash never leaves the server.
  const lookup = await (
    await post('/api/orders/guest-lookup', {
      orderId: created.orderId,
      token: replayed.trackingToken || created.trackingToken,
    })
  ).json();
  assert.equal(lookup.success, true, JSON.stringify(lookup));
  assert.equal(lookup.order.id, created.orderId);
  assert.ok(!('guestTokenHash' in lookup.order));

  const denied = await (
    await post('/api/orders/guest-lookup', { orderId: created.orderId, token: 'wrong' })
  ).json();
  assert.deepEqual(denied, { success: false, error: 'Order not found.' });
});
