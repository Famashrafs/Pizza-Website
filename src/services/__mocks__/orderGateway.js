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

const receiptPath = (restaurantId, checkoutId) =>
  `checkoutReceipts/${crypto
    .createHash('sha1')
    .update(`${restaurantId}:${checkoutId || ''}`)
    .digest('hex')}`;

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
  const restaurantId = String(payload.restaurantId || RESTAURANT_ID);
  const checkoutId = String(payload.idempotencyKey || '');

  // Mirrors the callable rejecting an unauthenticated caller: the production
  // function requires a verified Firebase uid (anonymous or registered).
  if (!payload.customerId) {
    return {
      success: false,
      error: 'You must be signed in to place an order.',
      errors: { auth: 'You must be signed in to place an order.' },
    };
  }

  // Concurrency-safe dedupe: a receipt that exists points at the original order.
  if (checkoutId) {
    const existing = await db.getDoc(receiptPath(restaurantId, checkoutId));
    if (existing && existing.orderId) {
      const order = await db.getDoc(`orders/${existing.orderId}`);
      if (order) {
        return { success: true, reuse: true, order, orderId: existing.orderId };
      }
    }
  }

  const restaurant = await db.getDoc(`restaurants/${restaurantId}`);
  const products = await db.getDocs('products', {
    where: [{ field: 'restaurantId', op: '==', value: restaurantId }],
  });

  const built = orderCore.buildOrder({
    uid: payload.customerId || 'anon-uid',
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
    await db.setDoc(receiptPath(restaurantId, checkoutId), {
      orderId: built.orderId,
      checkoutId,
      restaurantId,
    });
  }

  return {
    success: true,
    reuse: false,
    orderId: built.orderId,
    ...clientShape(built.order, built.trackingToken || null),
  };
}

const orderGateway = { placeOrderViaGateway, getGuestOrderViaGateway };

export default orderGateway;