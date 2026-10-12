// Manual Jest mock for `src/services/orderGateway.js`.
//
// In unit tests the callable transport is replaced by the REAL server-side
// pricing core (`functions/lib/orderCore.js`), threaded through the in-memory
// Firestore mock — exactly the logic the production `createOrder` Cloud
// Function runs. This keeps the service-layer contract honest: `createOrder`
// sends the raw checkout request and receives a server-computed order; it never
// computes money itself.
//
// The mock mirrors the function's idempotency flow with a `checkoutReceipts`
// document (keyed on restaurantId + checkoutId for the test double), so a
// repeated submit with the same key returns the original order.

const crypto = require('crypto');
const orderCore = require('../../../functions/lib/orderCore.js');
const db = require('../db');

const RESTAURANT_ID = 'restaurant-pizza-demo';

// Mirrors the production receipt id: it binds the requester identity as well as
// the restaurant + checkout key, so one guest/customer can never reuse another
// requester's key to resolve to their order.
const receiptPath = (uid, restaurantId, checkoutId) =>
  `checkoutReceipts/${crypto
    .createHash('sha1')
    .update(`${uid}:${restaurantId}:${checkoutId || ''}`)
    .digest('hex')}`;

// Stand-in for the Firestore transaction lock: concurrent, identical submits
// for the same requester/restaurant/key share one in-flight result so the mock
// creates exactly one order (the production function serializes them inside the
// transaction).
const inflight = new Map();

// Mirrors the production callable: the raw guest tracking token is returned to
// the client exactly once and is NEVER persisted — only its hash is written.
function clientShape(order, trackingToken) {
  const { guestTokenHash: _hash, ...rest } = order;
  return { order: rest, trackingToken };
}

export async function getGuestOrderViaGateway({ orderId, token } = {}) {
  if (!orderId || !token) {
    return { success: false, error: 'Order not found.' };
  }
  const order = await db.getDoc(`orders/${orderId}`);
  if (!order || !orderCore.verifyGuestToken(token, order.guestTokenHash)) {
    return { success: false, error: 'Order not found.' };
  }
  const { guestTokenHash: _hash, ...rest } = order;
  return { success: true, order: rest };
}

export async function placeOrderViaGateway(payload = {}) {
  const uid = String(payload.customerId || '');
  const restaurantId = String(payload.restaurantId || RESTAURANT_ID);
  const checkoutId = String(payload.idempotencyKey || '');
  const requestSignature = orderCore.buildRequestSignature({
    ...payload,
    restaurantId,
  });

  // Mirrors the callable rejecting an unauthenticated caller: the production
  // function requires a verified Firebase uid (anonymous or registered).
  if (!uid) {
    return {
      success: false,
      error: 'You must be signed in to place an order.',
      errors: { auth: 'You must be signed in to place an order.' },
    };
  }

  // Concurrent, identical submits share one in-flight run (production
  // serializes them inside the transaction), so a double-click never mints two
  // orders. A different payload for the same key does NOT share a result.
  const key = checkoutId
    ? `${receiptPath(uid, restaurantId, checkoutId)}::${requestSignature}`
    : null;
  if (key && inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    // Concurrency-safe dedupe: a receipt that exists points at the original order.
    if (checkoutId) {
      const existing = await db.getDoc(receiptPath(uid, restaurantId, checkoutId));
      if (existing && existing.orderId) {
        // Pin the receipt to the same requester + restaurant, mirroring
        // production: another guest/customer cannot replay this key.
        if (
          (existing.uid && existing.uid !== uid) ||
          (existing.restaurantId && existing.restaurantId !== restaurantId)
        ) {
          return {
            success: false,
            error: 'This checkout could not be verified. Please start a new checkout.',
            errors: {},
          };
        }
        const order = await db.getDoc(`orders/${existing.orderId}`);
        if (order) {
          // Reuse only the SAME logical checkout (see functions/index.js).
          if (existing.requestHash && existing.requestHash !== requestSignature) {
            return {
              success: false,
              error:
                'This checkout could not be verified. Please start a new checkout.',
              errors: {},
            };
          }
          // Guest retry: rotate the tracking token so the lost response can be
          // recovered. Only the hash is stored; the fresh plaintext leaves once.
          if (order.guestTokenHash) {
            const rotatedToken = orderCore.generateGuestToken();
            await db.updateDoc(`orders/${existing.orderId}`, {
              guestTokenHash: orderCore.sha256hex(rotatedToken),
              updatedAt: db.serversNow(),
            });
            const rotated = await db.getDoc(`orders/${existing.orderId}`);
            return {
              success: true,
              reuse: true,
              orderId: existing.orderId,
              ...clientShape(rotated, rotatedToken),
            };
          }
          return { success: true, reuse: true, order, orderId: existing.orderId };
        }
      }
    }

    const restaurant = await db.getDoc(`restaurants/${restaurantId}`);
    const products = await db.getDocs('products', {
      where: [{ field: 'restaurantId', op: '==', value: restaurantId }],
    });

    const built = orderCore.buildOrder({
      uid,
      isAnonymous: payload.customerType === 'guest',
      restaurantId,
      restaurantExists: Boolean(restaurant),
      settings: restaurant,
      products,
      cartItems: payload.items,
      customer: payload.customer || {},
      fulfillmentType: payload.fulfillmentType || 'delivery',
      address: payload.address || null,
      paymentMethod: payload.paymentMethod || '',
      customerNotes: payload.customerNotes || '',
      promoCode: payload.promoCode || '',
      idempotencyKey: checkoutId || null,
    });

    if (!built.success) {
      return { success: false, ...built };
    }

    // Persist with server timestamps (the mock materializes them as a Date),
    // then write the receipt so retries resolve to the same order.
    const { createdAt: _c, updatedAt: _u, ...docWithoutStamps } = built.order;
    const stored = {
      ...docWithoutStamps,
      createdAt: db.serversNow(),
      updatedAt: db.serversNow(),
    };

    await db.setDoc(`orders/${built.orderId}`, stored);
    if (checkoutId) {
      await db.setDoc(receiptPath(uid, restaurantId, checkoutId), {
        uid,
        orderId: built.orderId,
        checkoutId,
        restaurantId,
        requestHash: requestSignature,
      });
    }

    return {
      success: true,
      reuse: false,
      orderId: built.orderId,
      ...clientShape(built.order, built.trackingToken || null),
    };
  })();

  if (key) {
    inflight.set(key, task);
    try {
      return await task;
    } finally {
      inflight.delete(key);
    }
  }
  return task;
}

const orderGateway = { placeOrderViaGateway, getGuestOrderViaGateway };

export default orderGateway;