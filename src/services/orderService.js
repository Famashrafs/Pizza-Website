// Order creation boundary. Everything here is treated as the authoritative
// "server": it re-fetches the catalog, re-validates the cart and customer,
// recalculates every price, and only then persists the order. Totals coming
// from the client are never trusted.
//
// Orders live in the flat `orders` collection of Firestore. Each order is
// tagged with `restaurantId` (the restaurant that fulfils it) and `customerId`
// (the account that placed it). Access is enforced through indexed queries at
// the service layer AND through `firestore.rules`, so a customer can only ever
// read their own orders and an owner only their restaurant's orders.

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
import { calculateTotals } from '../utils/cartPricing.js';
import {
  validateCustomerInfo,
  validateAddress,
  formatAddress,
  getEstimatedTime,
} from '../utils/checkoutLogic.js';
import {
  createPaymentIntent,
  getPaymentMethod,
  getInitialPaymentStatus,
} from './paymentService.js';
import db from './db';

const COLLECTION = 'orders';
const path = (id) => `${COLLECTION}/${id}`;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function generateOrderId() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0');
  return `ORD-${stamp}${rand}`;
}

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
  const errors = {};

  if (!cartItems.length) {
    errors.cart = 'Your cart is empty.';
  }

  // Checkout requires an authenticated customer — the UID becomes the order's
  // owner and the only key under which the customer can ever read it.
  if (!customerId) {
    errors.auth = 'You must be signed in to place an order.';
  }

  const customerErrors = validateCustomerInfo(customer);
  if (Object.keys(customerErrors).length) {
    errors.customer = customerErrors;
  }

  const addressErrors = validateAddress(address || {}, fulfillmentType);
  if (Object.keys(addressErrors).length) {
    errors.address = addressErrors;
  }

  const payment = getPaymentMethod(paymentMethod);
  if (!payment) {
    errors.payment = 'Please choose a payment method.';
  } else if (!payment.enabled) {
    errors.payment = `${payment.label} is not available yet. Please choose another method.`;
  }

  // The storefront only ever produces orders for its own restaurant, but the
  // restaurant is still validated so a stale/wrong id never produces an order.
  const restaurant = await db.getDoc(`restaurants/${restaurantId}`);
  if (!restaurant || !restaurantId) {
    errors.restaurant = 'This store is unavailable right now. Please try again later.';
  }

  // Rebuild every line from the LIVE catalog scoped to the order's restaurant.
  const products = await fetchProducts(restaurantId);
  const { items, issues } = await recalculateItems(cartItems, products);
  if (issues.length) {
    errors.items = issues;
  }

  if (Object.keys(errors).length) {
    return {
      success: false,
      errors,
      error: 'We could not place your order. Please review the highlighted fields.',
    };
  }

  // Idempotency: a repeated submit (double click, refresh after write) with the
  // same key returns the original order instead of creating a duplicate.
  if (idempotencyKey && customerId) {
    const existing = await findOrderByCheckoutId(customerId, idempotencyKey);
    if (existing) {
      return { success: true, order: existing, reuse: true };
    }
  }

  // Authoritative totals — recomputed from live prices. The client only ever
  // supplies the item selections and promo code; money is derived here.
  const totals = calculateTotals(items, { promoCode, fulfillmentType });

  const phone = String(customer.phone || '').trim();
  const normalizedAddress =
    fulfillmentType === 'pickup'
      ? null
      : {
          street: String(address.street || '').trim(),
          area: String(address.area || '').trim(),
          building: String(address.building || '').trim(),
          apartment: String(address.apartment || '').trim(),
          floor: String(address.floor || '').trim(),
          landmark: String(address.landmark || '').trim(),
          city: String(address.city || '').trim(),
          phone: String(address.phone || phone).trim(),
        };

  let paymentStatus = getInitialPaymentStatus(payment.id);
  let paymentProvider = payment.provider || null;
  try {
    const intent = createPaymentIntent({ method: payment.id });
    paymentStatus = intent.status;
    paymentProvider = intent.provider;
  } catch (err) {
    paymentStatus = 'pending';
  }

  const orderId = generateOrderId();

  const order = {
    // Multi-tenant tag: every order belongs to exactly one restaurant. The
    // customer-facing store produces orders for the deployment's restaurant;
    // the admin dashboard reads orders strictly by restaurantId.
    restaurantId,
    customerId,
    customer: {
      fullName: String(customer.fullName || '').trim(),
      email: String(customer.email || '').trim(),
      phone,
    },
    items,
    subtotal: totals.subtotal,
    deliveryFee: totals.deliveryFee,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total,
    promoCode: totals.promoCode || null,
    pricing: {
      subtotal: totals.subtotal,
      discount: totals.discount,
      promoCode: totals.promoCode,
      deliveryFee: totals.deliveryFee,
      freeDelivery: totals.freeDelivery,
      tax: totals.tax,
      taxRate: totals.taxRate,
      fulfillmentType,
    },
    fulfillmentType,
    address: normalizedAddress,
    addressText: normalizedAddress ? formatAddress(normalizedAddress) : null,
    paymentMethod: payment.id,
    paymentStatus,
    paymentProvider,
    orderStatus: ORDER_STATUS.PENDING,
    customerNotes: String(customerNotes || '').trim(),
    estimatedTime: getEstimatedTime(fulfillmentType),
    checkoutId: idempotencyKey || null,
    statusHistory: [
      { status: ORDER_STATUS.PENDING, at: db.serversNow(), changedBy: 'customer' },
    ],
    createdAt: db.serversNow(),
    updatedAt: db.serversNow(),
  };

  await db.setDoc(path(orderId), order);

  // Read back through the same path the UI uses so server timestamps are
  // normalized (Timestamp -> ISO) exactly as they will appear everywhere else.
  const stored = await db.getDoc(path(orderId));
  return {
    success: true,
    order: normalizeOrder(hydrateOrder(stored || { ...order, id: orderId })),
  };
}

// Orders for one customer are fetched once (indexed on customerId) and the
// idempotency key matched in code, so no composite index is required.
async function findOrderByCheckoutId(customerId, idempotencyKey) {
  const docs = await db.getDocs(COLLECTION, {
    where: [{ field: 'customerId', op: '==', value: customerId }],
  });
  const match = docs.find((order) => order.checkoutId === idempotencyKey);
  return match ? normalizeOrder(hydrateOrder(match)) : null;
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

  const now = db.serversNow();
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  await db.updateDoc(path(id), {
    orderStatus: ORDER_STATUS.CANCELLED,
    cancelledAt: now,
    cancelledBy: 'customer',
    statusHistory: [
      ...history,
      { status: ORDER_STATUS.CANCELLED, at: now, changedBy: 'customer' },
    ],
    updatedAt: now,
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

  const now = db.serversNow();
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const patch = {
    orderStatus: nextStatus,
    statusUpdatedAt: now,
    statusHistory: [
      ...history,
      { status: nextStatus, at: now, changedBy, note: note || null },
    ],
    updatedAt: now,
  };

  // Cancellation keeps cancelledAt/cancelledBy consistent regardless of which
  // side triggered it (customer via cancelOrder, staff via this helper).
  if (nextStatus === ORDER_STATUS.CANCELLED) {
    patch.cancelledAt = now;
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