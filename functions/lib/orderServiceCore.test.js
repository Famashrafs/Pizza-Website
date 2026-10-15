// Offline tests for the shared order engine (functions/lib/orderServiceCore.js).
//
// The engine is the single source of truth behind BOTH the Firebase callable
// (functions/index.js) and the free-tier demo HTTP API (server/index.js). It has
// no Firebase imports, so these tests drive it with an in-memory Firestore
// double and assert the behaviour that keeps the order flow trustworthy:
//
//   - identity always comes from the verified auth context,
//   - prices/totals are recomputed from the live catalog + settings,
//   - idempotency receipts are transactional and payload-fingerprinted,
//   - guest tracking tokens are stored as hashes and rotate on replay.
//
// Run: npm run test:functions

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createOrderService,
  receiptId,
  sanitize,
  withoutGuestToken,
  serializedShaped,
} = require('./orderServiceCore');
const { RESTAURANT_ID } = require('./restaurantDefaults');
const { sha256hex, verifyGuestToken } = require('./orderCore');

const SERVER_TS = { __serverTimestamp: true };

const SETTINGS = {
  currency: '$',
  taxRate: 0.08,
  minOrder: 0,
  deliveryFee: 3.99,
  freeDeliveryThreshold: 35,
  deliveryEnabled: true,
};

const PRODUCTS = {
  p1: {
    id: 'p1',
    name: 'Margherita',
    restaurantId: RESTAURANT_ID,
    available: true,
    basePrice: 10,
    sizes: [],
    crusts: [],
    toppings: [],
    image: 'p1.png',
  },
  p2: {
    id: 'p2',
    name: 'Pepperoni',
    restaurantId: RESTAURANT_ID,
    available: true,
    basePrice: 12,
    sizes: [],
    crusts: [],
    toppings: [],
    image: 'p2.png',
  },
  gone: {
    id: 'gone',
    name: 'Sold out',
    restaurantId: RESTAURANT_ID,
    available: false,
    basePrice: 9,
    sizes: [],
    crusts: [],
    toppings: [],
    image: 'gone.png',
  },
  foreign: {
    id: 'foreign',
    name: 'Other restaurant pie',
    restaurantId: 'restaurant-somebody-else',
    available: true,
    basePrice: 1,
    sizes: [],
    crusts: [],
    toppings: [],
    image: 'foreign.png',
  },
};

const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function seed() {
  const store = new Map();
  store.set(`restaurants/${RESTAURANT_ID}`, clone(SETTINGS));
  for (const product of Object.values(PRODUCTS)) {
    store.set(`products/${product.id}`, clone(product));
  }
  return store;
}

// Minimal Firestore double: doc get/set/update, a single-field `where`, and a
// runTransaction that applies writes synchronously (enough for this engine).
function createFakeDb(store) {
  const docRef = (name, id) => {
    const path = `${name}/${id}`;
    return {
      id,
      path,
      async get() {
        const data = store.get(path);
        return { id, exists: data !== undefined, data: () => clone(data) };
      },
    };
  };

  const query = (name, field, op, value) => ({
    async get() {
      const docs = [];
      for (const [path, data] of store.entries()) {
        const parts = path.split('/');
        if (parts.length !== 2 || parts[0] !== name) continue;
        if (op === '==' && data && data[field] === value) {
          docs.push({ id: parts[1], data: () => clone(data) });
        }
      }
      return {
        size: docs.length,
        docs,
        forEach(cb) {
          docs.forEach(cb);
        },
      };
    },
  });

  return {
    collection(name) {
      return {
        doc: (id) => docRef(name, id),
        where: (field, op, value) => query(name, field, op, value),
      };
    },
    async runTransaction(run) {
      const tx = {
        get: (target) => target.get(),
        set: (ref, data) => store.set(ref.path, clone(data)),
        update: (ref, data) => {
          const current = store.get(ref.path) || {};
          store.set(ref.path, { ...clone(current), ...clone(data) });
        },
      };
      return run(tx);
    },
  };
}

function buildService() {
  const store = seed();
  const db = createFakeDb(store);
  const service = createOrderService({ db, serverTimestamp: () => SERVER_TS });
  return { service, store, db };
}

function validPayload(overrides = {}) {
  return {
    restaurantId: RESTAURANT_ID,
    idempotencyKey: 'checkout-1',
    items: [{ productId: 'p1', qty: 2 }],
    customer: {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '5551234567',
    },
    fulfillmentType: 'delivery',
    address: { street: '1 Analytical Ave', city: 'London', phone: '5551234567' },
    paymentMethod: 'cash',
    ...overrides,
  };
}

const guestAuth = {
  uid: 'guest-1',
  token: { firebase: { sign_in_provider: 'anonymous' } },
};
const userAuth = {
  uid: 'user-1',
  token: { firebase: { sign_in_provider: 'password' } },
};

const orderCount = (store) =>
  [...store.keys()].filter((key) => key.startsWith('orders/')).length;

// ---------------------------------------------------------------------------

test('rejects an unauthenticated checkout without touching the catalog', async () => {
  const { service, store } = buildService();

  const result = await service.createOrder({ data: validPayload(), auth: null });

  assert.equal(result.success, false);
  assert.ok(result.errors.auth);
  assert.equal(orderCount(store), 0);
});

test('creates a guest order with server-recomputed totals and a hashed token', async () => {
  const { service, store } = buildService();

  const result = await service.createOrder({ data: validPayload(), auth: guestAuth });

  assert.equal(result.success, true);
  assert.equal(result.reuse, false);
  assert.equal(result.order.customerId, 'guest-1');
  assert.equal(result.order.customerType, 'guest');
  assert.equal(result.order.orderStatus, 'placed');
  assert.equal(result.order.paymentStatus, 'pending');

  // 2 × $10 = $20 subtotal, +$3.99 delivery, +8% tax on $20 = $1.60 → $25.59
  assert.equal(result.order.subtotal, 20);
  assert.equal(result.order.deliveryFee, 3.99);
  assert.equal(result.order.tax, 1.6);
  assert.equal(result.order.total, 25.59);

  // The raw token leaves exactly once; only its hash is persisted.
  assert.ok(result.trackingToken);
  assert.equal(result.order.guestTokenHash, undefined);
  assert.ok(result.order.id);

  const stored = store.get(`orders/${result.order.id}`);
  assert.ok(stored);
  assert.equal(stored.guestTokenHash, sha256hex(result.trackingToken));
  assert.notEqual(stored.guestTokenHash, result.trackingToken);
  assert.equal(verifyGuestToken(result.trackingToken, stored.guestTokenHash), true);
  assert.ok(!JSON.stringify(stored).includes(result.trackingToken));
});

test('creates a registered-customer order with no guest token', async () => {
  const { service } = buildService();

  const result = await service.createOrder({ data: validPayload(), auth: userAuth });

  assert.equal(result.success, true);
  assert.equal(result.order.customerId, 'user-1');
  assert.equal(result.order.customerType, 'customer');
  assert.equal(result.trackingToken, undefined);
  assert.equal(result.order.guestTokenHash, undefined);
});

test('ignores client-supplied identity (cannot impersonate or self-elevate)', async () => {
  const { service } = buildService();

  const result = await service.createOrder({
    data: validPayload({
      customerId: 'victim-uid',
      customerType: 'customer',
      role: 'platform_admin',
    }),
    auth: guestAuth,
  });

  assert.equal(result.success, true);
  assert.equal(result.order.customerId, 'guest-1');
  assert.equal(result.order.customerType, 'guest');
});

test('recomputes every money field from the catalog, ignoring client prices', async () => {
  const { service } = buildService();

  const result = await service.createOrder({
    data: validPayload({
      // Inflated / deflated client fields must never be trusted.
      items: [
        {
          productId: 'p1',
          qty: 2,
          price: 0.01,
          unitPrice: 0.01,
          lineTotal: 0.02,
        },
      ],
      subtotal: 0.02,
      deliveryFee: 0,
      tax: 0,
      total: 0.02,
    }),
    auth: guestAuth,
  });

  assert.equal(result.success, true);
  assert.equal(result.order.subtotal, 20);
  assert.equal(result.order.tax, 1.6);
  assert.equal(result.order.total, 25.59);
  assert.equal(result.order.pricing.taxRate, 0.08);
});

test('rejects items from another restaurant, unknown items and sold-out items', async () => {
  const { service } = buildService();

  const result = await service.createOrder({
    data: validPayload({
      items: [
        { productId: 'foreign', qty: 1 },
        { productId: 'nope', qty: 1 },
        { productId: 'gone', qty: 1 },
      ],
    }),
    auth: guestAuth,
  });

  assert.equal(result.success, false);
  assert.ok(Array.isArray(result.errors.items));
  assert.equal(result.errors.items.length, 3);
});

test('rejects an empty cart', async () => {
  const { service } = buildService();

  const result = await service.createOrder({
    data: validPayload({ items: [] }),
    auth: guestAuth,
  });

  assert.equal(result.success, false);
  assert.equal(result.errors.cart, 'Your cart is empty.');
});

test('a replayed idempotency key reuses the original order exactly once', async () => {
  const { service, store } = buildService();
  const payload = validPayload();

  const first = await service.createOrder({ data: payload, auth: guestAuth });
  const second = await service.createOrder({ data: payload, auth: guestAuth });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(second.reuse, true);
  assert.equal(second.order.id, first.order.id);
  assert.equal(orderCount(store), 1);

  const receipts = [...store.keys()].filter((key) =>
    key.startsWith('checkoutReceipts/')
  );
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0], `checkoutReceipts/${receiptId('guest-1', RESTAURANT_ID, 'checkout-1')}`);
});

test('a replayed guest checkout rotates the tracking token (old token dies)', async () => {
  const { service, store } = buildService();
  const payload = validPayload();

  const first = await service.createOrder({ data: payload, auth: guestAuth });
  const second = await service.createOrder({ data: payload, auth: guestAuth });

  assert.equal(second.reuse, true);
  assert.ok(second.trackingToken);
  assert.notEqual(second.trackingToken, first.trackingToken);

  const stored = store.get(`orders/${first.order.id}`);
  assert.equal(verifyGuestToken(second.trackingToken, stored.guestTokenHash), true);
  assert.equal(verifyGuestToken(first.trackingToken, stored.guestTokenHash), false);

  const freshLookup = await service.getGuestOrder({
    data: { orderId: first.order.id, token: second.trackingToken },
  });
  const staleLookup = await service.getGuestOrder({
    data: { orderId: first.order.id, token: first.trackingToken },
  });
  assert.equal(freshLookup.success, true);
  assert.equal(staleLookup.success, false);
});

test('the same key with a different cart is rejected (fingerprint mismatch)', async () => {
  const { service, store } = buildService();

  const first = await service.createOrder({ data: validPayload(), auth: guestAuth });
  const second = await service.createOrder({
    data: validPayload({ items: [{ productId: 'p1', qty: 1 }] }),
    auth: guestAuth,
  });

  assert.equal(first.success, true);
  assert.equal(second.success, false);
  assert.match(second.error, /start a new checkout/i);
  assert.equal(orderCount(store), 1);
});

test('idempotency keys are scoped per user (no cross-user reuse)', async () => {
  const { service, store } = buildService();

  const guest = await service.createOrder({ data: validPayload(), auth: guestAuth });
  const user = await service.createOrder({ data: validPayload(), auth: userAuth });

  assert.equal(guest.success, true);
  assert.equal(user.success, true);
  assert.notEqual(guest.order.id, user.order.id);
  assert.equal(orderCount(store), 2);
});

test('guest lookup requires both the order id and the correct token', async () => {
  const { service } = buildService();
  const created = await service.createOrder({ data: validPayload(), auth: guestAuth });

  const ok = await service.getGuestOrder({
    data: { orderId: created.order.id, token: created.trackingToken },
  });
  assert.equal(ok.success, true);
  assert.equal(ok.order.id, created.order.id);
  assert.equal(ok.order.guestTokenHash, undefined);

  assert.deepEqual(
    await service.getGuestOrder({ data: { orderId: created.order.id, token: 'wrong' } }),
    { success: false, error: 'Order not found.' }
  );
  assert.deepEqual(
    await service.getGuestOrder({ data: { orderId: 'ORD-UNKNOWN', token: created.trackingToken } }),
    { success: false, error: 'Order not found.' }
  );
  assert.deepEqual(
    await service.getGuestOrder({ data: { orderId: '', token: '' } }),
    { success: false, error: 'Order not found.' }
  );
});

test('getGuestOrder does not leak the guest token hash on success', async () => {
  const { service } = buildService();
  const created = await service.createOrder({ data: validPayload(), auth: guestAuth });

  const lookup = await service.getGuestOrder({
    data: { orderId: created.order.id, token: created.trackingToken },
  });

  assert.equal(lookup.success, true);
  assert.ok(!('guestTokenHash' in lookup.order));
});

// --- Pure helpers ----------------------------------------------------------

test('sanitize / withoutGuestToken / serializedShaped behave as documented', () => {
  const cleaned = sanitize({ a: 1, b: undefined, c: [1, 2] });
  assert.deepEqual(cleaned, { a: 1, c: [1, 2] });
  assert.ok(!('b' in cleaned));

  assert.deepEqual(withoutGuestToken({ id: 'x', guestTokenHash: 'h' }), { id: 'x' });

  const serialized = serializedShaped({
    id: 'x',
    guestTokenHash: 'h',
    createdAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
  });
  assert.equal(serialized.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(serialized.guestTokenHash, undefined);
});

test('receiptId is a deterministic sha1 of uid:restaurant:checkout', () => {
  const a = receiptId('u1', 'r1', 'c1');
  const b = receiptId('u1', 'r1', 'c1');
  const c = receiptId('u2', 'r1', 'c1');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{40}$/);
});
