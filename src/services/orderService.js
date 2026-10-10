// Order service for the customer storefront and admin dashboard.
//
// ORDER CREATION IS NOT TRUSTED HERE — it is delegated to the `createOrder`
// Cloud Function (functions/index.js), reached through `orderGateway`. The
// function recomputes every price from the live catalog and the authoritative
// restaurant settings document, so browser-side totals are never part of the
// cost of an order. `firestore.rules` denies client-side `orders` creation, so
// the only way an order appears is through the function (Admin SDK).
//
// Everything else in this module (reads, cancellation, status transitions,
// subscriptions, reorder) runs client-side against `firestore.rules`, which
// keep orders scoped to their owner and their restaurant.
//
// Orders live in the flat `orders` collection of Firestore. Each order is
// tagged with `restaurantId` (the restaurant that fulfils it) and `customerId`
// (the verified account that placed it). Access is enforced through indexed
// queries at the service layer AND through `firestore.rules`, so a customer can
// only ever read their own orders and an owner only their restaurant's orders.

import { fetchProducts } from './menuService.js';
import { RESTAURANT_ID } from '../config/restaurant';
import {
  ORDER_STATUS,
  ORDER_STATUS_META,
  isOrderCancellable,
  isValidOrderStatus,
  normalizeOrder,
  normalizeOrderStatus,
  canTransitionToOrderStatus,
} from '../config/orderStatus.js';
import { createCartItem, createSimpleCartItem } from '../utils/cartItem.js';
import { placeOrderViaGateway, getGuestOrderViaGateway } from './orderGateway.js';
import db from './db';

const COLLECTION = 'orders';
const path = (id) => `${COLLECTION}/${id}`;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Normalizes stored timestamp values into ISO strings (one place, once) and
// exposes the documented compatibility aliases (`placedAt`, `customerInfo`,
// `deliveryAddress`, history `changedAt`) without duplicating stored data.
function hydrateOrder(order) {
  if (!order) return null;
  const createdAt = db.timestampToISO(order.createdAt) || order.createdAt || null;
  return {
    ...order,
    createdAt,
    placedAt: createdAt,
    updatedAt: db.timestampToISO(order.updatedAt) || order.updatedAt || null,
    cancelledAt: db.timestampToISO(order.cancelledAt) || order.cancelledAt || null,
    statusUpdatedAt:
      db.timestampToISO(order.statusUpdatedAt) || order.statusUpdatedAt || null,
    statusHistory: Array.isArray(order.statusHistory)
      ? order.statusHistory.map((entry) => {
          const at = db.timestampToISO(entry.at) || entry.at || null;
          return {
            ...entry,
            at,
            changedAt: at,
            changedBy: entry.changedBy || null,
            note: entry.note || null,
          };
        })
      : [],
    customerInfo: order.customer
      ? {
          fullName: order.customer.fullName || '',
          email: order.customer.email || '',
          phone: order.customer.phone || '',
        }
      : null,
    deliveryAddress: order.address || null,
  };
}

// Rebuilds each cart line from the live catalog so prices and options are
// always current. Returns the rebuilt lines plus any lines that can no longer
// be ordered.
export async function recalculateItems(cartItems = [], products = []) {
  const byId = new Map((products || []).map((product) => [product.id, product]));
  const items = [];
  const issues = [];

  for (const line of cartItems) {
    const product = byId.get(line.productId);
    if (!product) {
      issues.push({
        id: line.id,
        name: line.name,
        reason: 'This item is no longer on the menu.',
      });
      continue;
    }
    if (product.available === false) {
      issues.push({
        id: line.id,
        name: line.name,
        reason: 'This item is currently unavailable.',
      });
      continue;
    }

    const qty = Math.max(1, Math.floor(Number(line.qty) || 1));
    const rebuilt = line.config
      ? createCartItem(product, { ...line.config, qty })
      : createSimpleCartItem(product);

    if (!rebuilt) {
      issues.push({
        id: line.id,
        name: line.name,
        reason: 'The selected options are no longer available.',
      });
      continue;
    }

    items.push({
      ...rebuilt,
      qty,
      unitPrice: rebuilt.unitPrice,
      lineTotal: round2(rebuilt.unitPrice * qty),
    });
  }

  return { items, issues };
}

export async function createOrder({
  customerId = null,
  customerType = 'customer',
  items: cartItems = [],
  customer = {},
  fulfillmentType = 'delivery',
  address = null,
  paymentMethod = '',
  customerNotes = '',
  promoCode = '',
  restaurantId = RESTAURANT_ID,
  idempotencyKey = null,
} = {}) {
  // Orders are ONLY created by the trusted `createOrder` Cloud Function (see
  // functions/index.js), which the client reaches through `orderGateway`.
  // `firestore.rules` denies client-side order writes entirely, so no amount of
  // browser manipulation can influence totals: the function recomputes every
  // price from the live catalog and the authoritative restaurant settings.
  //
  // `customerId` is forwarded only so a development/test double can map
  // identity; the production function IGNORES it and derives customerId from
  // the caller's verified Firebase auth (anonymous or registered), so identity
  // can never be impersonated over the wire.
  const payload = {
    restaurantId,
    customerId,
    customerType,
    items: cartItems,
    customer,
    fulfillmentType,
    address,
    paymentMethod,
    customerNotes,
    promoCode,
    idempotencyKey,
  };

  const result = await placeOrderViaGateway(payload);

  if (!result || result.success !== true) {
    return result;
  }

  const stored = result.order || {};
  // Hydrate exactly as the read path does so the returned order matches what
  // the UI would see after a read-back (ISO timestamps, aliases, statusMeta).
  // Guest checkout additionally carries a trackingToken that the function
  // delivered exactly once — the confirmation page needs it for refresh-safe,
  // server-authorised tracking.
  return {
    success: true,
    order: normalizeOrder(
      hydrateOrder({ ...stored, id: stored.id || result.orderId })
    ),
    reuse: result.reuse === true,
    ...(result.trackingToken ? { trackingToken: result.trackingToken } : {}),
  };
}

// --- Order access (ownership is always enforced here) ---

export async function getOrderForUser(id, uid) {
  if (!id || !uid) return null;
  const order = await db.getDoc(path(id));
  if (!order) return null;
  // Strict ownership: never expose another customer's order, including legacy
  // orders that have no customerId.
  if (!order.customerId || order.customerId !== uid) return null;
  return normalizeOrder(hydrateOrder(order));
}

// Secure guest-order lookup for the confirmation page. A guest has no account,
// so instead of a Firestore read we ask the `getGuestOrder` callable, which
// verifies the high-entropy token the checkout response delivered once. A wrong
// or missing token is denied server-side before any order data leaves it.
export async function getGuestOrder(id, token) {
  if (!id || !token) return null;
  const result = await getGuestOrderViaGateway({ orderId: id, token });
  if (!result || result.success !== true || !result.order) return null;
  return normalizeOrder(hydrateOrder({ ...result.order, id: result.order.id || id }));
}

export async function getUserOrders(uid) {
  if (!uid) return [];
  const docs = await db.getDocs(COLLECTION, {
    where: [{ field: 'customerId', op: '==', value: uid }],
  });
  return docs.map((order) => normalizeOrder(hydrateOrder(order)));
}

// --- Restaurant-scoped access (admin dashboard only) ---

// Returns every order that belongs to a restaurant. Data isolation is enforced
// here: the caller passes the signed-in owner's restaurantId and this function
// never returns orders tagged with a different restaurant.
export async function getRestaurantOrders(restaurantId) {
  if (!restaurantId) return [];
  const docs = await db.getDocs(COLLECTION, {
    where: [{ field: 'restaurantId', op: '==', value: restaurantId }],
  });
  return docs.map((order) => normalizeOrder(hydrateOrder(order)));
}

// Single restaurant-scoped order. Ownership is enforced here the same way the
// list is: an order tagged with a different restaurant is never returned.
export async function getRestaurantOrderById(id, restaurantId) {
  if (!id || !restaurantId) return null;
  const order = await db.getDoc(path(id));
  if (!order) return null;
  const rid = order.restaurantId || RESTAURANT_ID;
  if (rid !== restaurantId) return null;
  return normalizeOrder(hydrateOrder(order));
}

// Real-time subscription scoped to one restaurant. The rules require an owner
// to read orders of their own restaurant only, so listeners without a
// restaurantId get a no-op unsubscribe. Firestore pushes a snapshot when the
// set changes (new order placed, status updated) and the caller re-runs its
// loader.
export function subscribeOrders(listener, { restaurantId = null } = {}) {
  if (!restaurantId) return () => {};
  return db.subscribe(
    COLLECTION,
    { where: [{ field: 'restaurantId', op: '==', value: restaurantId }] },
    listener
  );
}

// Real-time subscription scoped to ONE customer. Powers the customer order
// history and tracking pages: when a restaurant updates status, the customer's
// view refreshes. Listeners without a customerId get a no-op unsubscribe so the
// rules (which only allow reading your own orders) are never pushed against.
export function subscribeCustomerOrders(listener, { customerId = null } = {}) {
  if (!customerId) return () => {};
  return db.subscribe(
    COLLECTION,
    { where: [{ field: 'customerId', op: '==', value: customerId }] },
    listener
  );
}

// --- Cancellation (the only status change a customer may trigger) ---

// The patch is intentionally minimal: the customer cancellation rule in
// `firestore.rules` only permits those exact keys to change when the caller is
// the order's customer.
export async function cancelOrder(id, uid) {
  const order = await db.getDoc(path(id));
  if (!order || !order.customerId || order.customerId !== uid) {
    return { success: false, error: 'Order not found.' };
  }
  if (!isOrderCancellable(order)) {
    return {
      success: false,
      error: 'This order can no longer be cancelled. Please contact us for help.',
    };
  }

  const nowServer = db.serversNow();
  const nowClient = new Date().toISOString();
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  await db.updateDoc(path(id), {
    orderStatus: ORDER_STATUS.CANCELLED,
    cancelledAt: nowServer,
    cancelledBy: 'customer',
    statusHistory: [
      ...history,
      { status: ORDER_STATUS.CANCELLED, at: nowClient, changedBy: 'customer' },
    ],
    updatedAt: nowServer,
  });

  const updated = await db.getDoc(path(id));
  return { success: true, order: normalizeOrder(hydrateOrder(updated)) };
}

// --- Dashboard hook (not exposed to customers) ---

// Kept centralized so the restaurant dashboard drives
// placed → confirmed → preparing → ready | out_for_delivery → delivered (or
// cancelled) without any UI changes. `restaurantId` is always passed so an
// owner can only touch their own restaurant's orders.
export async function updateOrderStatus(id, status, {
  restaurantId = null,
  changedBy = 'owner',
  note = null,
} = {}) {
  if (!isValidOrderStatus(status)) {
    return { success: false, error: `Unknown order status: ${status}` };
  }

  const order = await db.getDoc(path(id));
  if (!order) {
    return { success: false, error: 'Order not found.' };
  }
  if (restaurantId) {
    const rid = order.restaurantId || RESTAURANT_ID;
    if (rid !== restaurantId) {
      return { success: false, error: 'Order not found.' };
    }
  }

  const nextStatus = normalizeOrderStatus(status);
  const currentStatus = normalizeOrderStatus(order.orderStatus);

  // Centralized transition rules — an invalid move (delivered → preparing,
  // cancelled → confirmed, skipping forward, etc.) is rejected before any write.
  const fulfillmentType = order.fulfillmentType || 'delivery';
  if (!canTransitionToOrderStatus(fulfillmentType, currentStatus, nextStatus)) {
    return {
      success: false,
      error: `Invalid status change: ${ORDER_STATUS_META[currentStatus]?.label ||
        currentStatus} cannot become ${
        ORDER_STATUS_META[nextStatus]?.label || nextStatus
      }.`,
    };
  }

  // Duplicate-status guard: no-op updates are rejected instead of appending an
  // identical history entry.
  if (currentStatus === nextStatus) {
    return {
      success: false,
      error: `Order is already marked ${ORDER_STATUS_META[nextStatus]?.label ||
        nextStatus.toLowerCase()}.`,
    };
  }

  const nowServer = db.serversNow();
  const nowClient = new Date().toISOString();
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const patch = {
    orderStatus: nextStatus,
    statusUpdatedAt: nowServer,
    statusHistory: [
      ...history,
      { status: nextStatus, at: nowClient, changedBy, note: note || null },
    ],
    updatedAt: nowServer,
  };

  // Cancellation keeps cancelledAt/cancelledBy consistent regardless of which
  // side triggered it (customer via cancelOrder, staff via this helper).
  if (nextStatus === ORDER_STATUS.CANCELLED) {
    patch.cancelledAt = nowServer;
    patch.cancelledBy = changedBy;
  }

  await db.updateDoc(path(id), patch);

  const updated = await db.getDoc(path(id));
  return { success: true, order: normalizeOrder(hydrateOrder(updated)) };
}

// --- Reorder ---

// Rebuilds an order's lines from the live catalog. Prices are always current,
// valid configurations are preserved, and anything unavailable is reported
// instead of silently added.
export function buildReorder(order, products = []) {
  const byId = new Map((products || []).map((product) => [product.id, product]));
  const items = [];
  const unavailable = [];

  for (const line of order?.items || []) {
    const product = byId.get(line.productId);
    if (!product || product.available === false) {
      unavailable.push({
        productId: line.productId,
        name: line.name,
        reason: product ? 'Currently unavailable' : 'No longer on the menu',
      });
      continue;
    }

    const qty = Math.max(1, Math.floor(Number(line.qty) || 1));
    const rebuilt = line.config
      ? createCartItem(product, { ...line.config, qty })
      : createSimpleCartItem(product);

    if (!rebuilt) {
      unavailable.push({
        productId: line.productId,
        name: line.name,
        reason: 'Selected options are no longer available',
      });
      continue;
    }

    items.push({
      ...rebuilt,
      qty,
      unitPrice: rebuilt.unitPrice,
      lineTotal: round2(rebuilt.unitPrice * qty),
    });
  }

  return { items, unavailable };
}

export async function reorder(order) {
  const products = await fetchProducts(order?.restaurantId || RESTAURANT_ID);
  return buildReorder(order, products);
}

export default createOrder;