// Full-stack wiring test: REAL Worker transport + REAL shared order engine +
// REAL Firestore REST adapter, against an in-memory fake of the Firestore
// REST API. This is the closest offline equivalent to a live checkout: it
// proves the whole Worker request path — CORS, token gate, authoritative
// pricing, idempotency, guest tokens, schema — without any network access.
//
// (Live end-to-end against production Firestore is verified separately with
// `npm run test:worker:emulator` and, after deployment, the manual checkout
// steps in worker/README.md — mocked tests alone never claim live success.)

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../src/app.js';
import { createOrderService } from '../../functions/lib/orderServiceCore.js';
import { createFirestore, serverTimestamp } from '../src/firestore.js';
import { createFakeFirestoreRest } from './helpers/fakeFirestoreRest.js';

const RESTAURANT_ID = 'restaurant-pizza-demo';

const PIZZA = {
  restaurantId: RESTAURANT_ID,
  name: 'Margherita',
  image: 'pizza.jpg',
  basePrice: 8,
  available: true,
  defaultSize: 'Medium',
  sizes: [
    { label: 'Small', adjust: -1 },
    { label: 'Medium', adjust: 0 },
    { label: 'Large', adjust: 3 },
  ],
  defaultCrust: 'thin',
  crusts: [
    { id: 'thin', label: 'Thin', price: 0, available: true },
    { id: 'pan', label: 'Pan', price: 2, available: true },
  ],
  toppings: [
    { id: 'cheese', name: 'Extra cheese', price: 1.5, available: true },
    { id: 'olives', name: 'Olives', price: 1, available: false },
  ],
  maxToppings: 3,
};

function setup({ verifyToken } = {}) {
  const fake = createFakeFirestoreRest();
  fake.seedDoc(`restaurants/${RESTAURANT_ID}`, {
    taxRate: 0.08,
    minOrder: 0,
    deliveryFee: 3.99,
    freeDeliveryThreshold: 35,
    deliveryEnabled: true,
  });
  fake.seedDoc('products/pizza-1', PIZZA);
  fake.seedDoc('products/pizza-soldout', { ...PIZZA, name: 'Hawaiian', available: false });

  const db = createFirestore({
    projectId: 'demo-worker-test',
    getAccessToken: async () => 'test-token',
    fetchImpl: fake.fetchImpl,
  });
  const orderService = createOrderService({ db, serverTimestamp });

  const handle = createWorkerApp({
    orderService,
    verifyToken:
      verifyToken ||
      (async (token) => {
        if (token !== 'guest-token') throw new Error('bad token');
        return { sub: 'guest-uid-1', firebase: { sign_in_provider: 'anonymous' } };
      }),
    allowedOrigins: 'http://localhost:3000,https://pizza.example.vercel.app',
    mode: 'demo',
    projectId: 'demo-worker-test',
    logError: () => {},
  });

  return { fake, handle, orderService };
}

function checkoutPayload(overrides = {}) {
  return {
    restaurantId: RESTAURANT_ID,
    idempotencyKey: 'chk-123',
    items: [
      {
        productId: 'pizza-1',
        qty: 2,
        // Tampered client-side pricing must be IGNORED by the server.
        price: 0.01,
        unitPrice: 0.01,
        lineTotal: 0.02,
        config: {
          sizeLabel: 'Large',
          crustId: 'pan',
          toppingIds: ['cheese'],
          instructions: '',
        },
      },
    ],
    customer: { fullName: 'Sam Guest', email: 'sam@example.com', phone: '5551234567' },
    fulfillmentType: 'delivery',
    address: { street: '1 Main St', city: 'Springfield', phone: '5551234567' },
    paymentMethod: 'cash',
    // More tampered fields the server must not trust:
    subtotal: 0.02,
    tax: 0,
    deliveryFee: 0,
    total: 0.02,
    role: 'restaurant_owner',
    customerId: 'someone-else',
    ...overrides,
  };
}

const postOrder = (handle, payload, token = 'guest-token') =>
  handle(
    new Request('https://api.test/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
  );

test('anonymous checkout recomputes authoritative prices and persists the order schema', async () => {
  const { handle, fake } = setup();
  const res = await postOrder(handle, checkoutPayload());
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.orderId.startsWith('ORD-'));

  // Unit price rebuilt from the catalog: 8 (base) + 3 (Large) + 2 (pan) + 1.5 (cheese) = 14.5
  assert.equal(body.order.items[0].unitPrice, 14.5);
  assert.equal(body.order.items[0].lineTotal, 29);
  assert.equal(body.order.subtotal, 29);
  // Delivery under threshold: 3.99. Tax on (29): 29 * 0.08 = 2.32. Total = 29 + 3.99 + 2.32 = 35.31
  assert.equal(body.order.deliveryFee, 3.99);
  assert.equal(body.order.tax, 2.32);
  assert.equal(body.order.total, 35.31);
  // Identity from the verified token; spoofed body fields ignored.
  assert.equal(body.order.customerId, 'guest-uid-1');
  assert.equal(body.order.customerType, 'guest');
  assert.equal(body.order.paymentMethod, 'cash');
  assert.equal(body.order.paymentStatus, 'pending');
  assert.equal(body.order.orderStatus, 'placed');

  // Guest capability token returned exactly once; only the hash is stored.
  assert.ok(body.trackingToken);
  const stored = fake.readDoc(`orders/${body.orderId}`);
  assert.ok(stored.guestTokenHash);
  assert.notEqual(stored.guestTokenHash, body.trackingToken);
  assert.ok(!('guestTokenHash' in body.order));
  // The stored hash must never appear anywhere in the client response.
  assert.ok(!JSON.stringify(body).includes(stored.guestTokenHash));

  // Idempotency receipt persisted.
  const receiptPaths = [...fake.docs.keys()].filter((p) => p.startsWith('checkoutReceipts/'));
  assert.equal(receiptPaths.length, 1);
});

test('replaying the SAME idempotency key returns the original order and rotates the guest token', async () => {
  const { handle } = setup();
  const first = await (await postOrder(handle, checkoutPayload())).json();
  const second = await (await postOrder(handle, checkoutPayload())).json();

  assert.equal(second.success, true);
  assert.equal(second.reuse, true);
  assert.equal(second.orderId, first.orderId);
  // Rotation: a fresh plaintext token, single use.
  assert.ok(second.trackingToken);
  assert.notEqual(second.trackingToken, first.trackingToken);

  // The NEW token works; the OLD one no longer does.
  const lookup = (token) =>
    handle(
      new Request('https://api.test/api/orders/guest-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: first.orderId, token }),
      })
    );
  assert.equal((await (await lookup(second.trackingToken)).json()).success, true);
  const oldRes = await lookup(first.trackingToken);
  assert.deepEqual(await oldRes.json(), { success: false, error: 'Order not found.' });
});

test('reusing an idempotency key with a DIFFERENT payload is refused', async () => {
  const { handle } = setup();
  await postOrder(handle, checkoutPayload());
  const res = await postOrder(
    handle,
    checkoutPayload({ items: [{ productId: 'pizza-1', qty: 1, config: { sizeLabel: 'Small', crustId: 'thin', toppingIds: [] } }] })
  );
  const body = await res.json();
  assert.equal(body.success, false);
  assert.match(body.error, /could not be verified/i);
});

test('concurrent duplicate submissions produce ONE order', async () => {
  const { handle, fake } = setup();
  const [a, b] = await Promise.all([
    postOrder(handle, checkoutPayload()),
    postOrder(handle, checkoutPayload()),
  ]);
  const bodyA = await a.json();
  const bodyB = await b.json();

  assert.equal(bodyA.success, true);
  assert.equal(bodyB.success, true);
  assert.equal(bodyA.orderId, bodyB.orderId);
  // Exactly one order document exists despite the race.
  const orderDocs = [...fake.docs.keys()].filter((p) => p.startsWith('orders/'));
  assert.equal(orderDocs.length, 1);
});

test('tampered prices/totals/roles in the body can never reach the stored order', async () => {
  const { handle, fake } = setup();
  const body = await (
    await postOrder(
      handle,
      checkoutPayload({
        subtotal: 0.01,
        total: 0.01,
        tax: 0,
        deliveryFee: 0,
        discount: 20,
        role: 'platform_admin',
        customerType: 'customer',
      })
    )
  ).json();

  const stored = fake.readDoc(`orders/${body.orderId}`);
  assert.equal(stored.total, 35.31);
  assert.equal(stored.subtotal, 29);
  assert.equal(stored.tax, 2.32);
  assert.equal(stored.deliveryFee, 3.99);
  assert.equal(stored.customerType, 'guest'); // token decides, not the body
  assert.equal(stored.customerId, 'guest-uid-1');
  assert.ok(!('role' in stored));
});

test('unknown products are rejected as issues, not priced', async () => {
  const { handle } = setup();
  const body = await (
    await postOrder(handle, checkoutPayload({ items: [{ productId: 'ghost-pizza', qty: 1 }] }))
  ).json();
  assert.equal(body.success, false);
  assert.ok(body.errors.items.some((issue) => /no longer on the menu/i.test(issue.reason)));
});

test('sold-out products are rejected as issues', async () => {
  const { handle } = setup();
  const body = await (
    await postOrder(handle, checkoutPayload({ items: [{ productId: 'pizza-soldout', qty: 1 }] }))
  ).json();
  assert.equal(body.success, false);
  assert.ok(body.errors.items.some((issue) => /currently unavailable/i.test(issue.reason)));
});

test('products belonging to ANOTHER restaurant cannot be ordered', async () => {
  const { handle, fake } = setup();
  fake.seedDoc('products/foreign-pizza', { ...PIZZA, restaurantId: 'other-restaurant' });
  const body = await (
    await postOrder(handle, checkoutPayload({ items: [{ productId: 'foreign-pizza', qty: 1 }] }))
  ).json();
  assert.equal(body.success, false);
  assert.ok(body.errors.items.some((issue) => /no longer on the menu/i.test(issue.reason)));
});

test('guest order retrieval works with the capability token and denies everything else', async () => {
  const { handle } = setup();
  const created = await (await postOrder(handle, checkoutPayload())).json();

  const lookup = (payload) =>
    handle(
      new Request('https://api.test/api/orders/guest-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );

  const ok = await (await lookup({ orderId: created.orderId, token: created.trackingToken })).json();
  assert.equal(ok.success, true);
  assert.equal(ok.order.id, created.orderId);
  assert.equal(ok.order.total, 35.31);
  assert.ok(!('guestTokenHash' in ok.order), 'stored hash must never be returned');

  // Order id alone (no token / wrong token) is never enough.
  assert.deepEqual(await (await lookup({ orderId: created.orderId })).json(), {
    success: false,
    error: 'Order not found.',
  });
  assert.deepEqual(await (await lookup({ orderId: created.orderId, token: 'guess' })).json(), {
    success: false,
    error: 'Order not found.',
  });
  assert.deepEqual(await (await lookup({ orderId: 'ORD-NOPE', token: created.trackingToken })).json(), {
    success: false,
    error: 'Order not found.',
  });
});

test('authenticated (registered) checkout carries no guest token and uses the token uid', async () => {
  const { handle } = setup({
    verifyToken: async (token) => {
      if (token !== 'user-token') throw new Error('bad');
      return { sub: 'registered-uid-9', firebase: { sign_in_provider: 'password' } };
    },
  });
  const body = await (await postOrder(handle, checkoutPayload(), 'user-token')).json();
  assert.equal(body.success, true);
  assert.equal(body.order.customerId, 'registered-uid-9');
  assert.equal(body.order.customerType, 'customer');
  assert.equal(body.trackingToken, undefined);
});

test('signed-out and invalid-token requests never reach the engine', async () => {
  const { handle } = setup();
  const noAuth = await handle(
    new Request('https://api.test/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload()),
    })
  );
  assert.equal(noAuth.status, 401);

  const badAuth = await postOrder(handle, checkoutPayload(), 'wrong-token');
  assert.equal(badAuth.status, 401);
});

test('CORS blocks a non-allowlisted origin before any engine work happens', async () => {
  const { handle } = setup();
  const res = await handle(
    new Request('https://api.test/api/orders/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
        Authorization: 'Bearer guest-token',
      },
      body: JSON.stringify(checkoutPayload()),
    })
  );
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'Origin not allowed.');
});

test('minimum-order rule is enforced from authoritative restaurant settings', async () => {
  const fake = createFakeFirestoreRest();
  fake.seedDoc(`restaurants/${RESTAURANT_ID}`, {
    taxRate: 0.08,
    minOrder: 100,
    deliveryFee: 3.99,
    freeDeliveryThreshold: 35,
    deliveryEnabled: true,
  });
  fake.seedDoc('products/pizza-1', PIZZA);
  const db = createFirestore({
    projectId: 'demo-worker-test',
    getAccessToken: async () => 't',
    fetchImpl: fake.fetchImpl,
  });
  const handle = createWorkerApp({
    orderService: createOrderService({ db, serverTimestamp }),
    verifyToken: async () => ({ sub: 'g1', firebase: { sign_in_provider: 'anonymous' } }),
    allowedOrigins: 'http://localhost:3000',
    logError: () => {},
  });

  const body = await (await postOrder(handle, checkoutPayload())).json();
  assert.equal(body.success, false);
  assert.match(body.errors.cart, /minimum/i);
});
