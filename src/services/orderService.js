// Order creation boundary. Everything here is treated as the authoritative
// "server": it re-fetches the catalog, re-validates the cart and customer,
// recalculates every price, and only then persists the order. Totals coming
// from the client are never trusted.

import { fetchProducts } from './menuService.js';
import {
  addOrder,
  getOrderById,
  getOrders,
  getOrdersForUser,
  updateOrder,
} from './storage.js';
import { RESTAURANT_ID } from '../config/restaurant';
import {
  ORDER_STATUS,
  isOrderCancellable,
  isValidOrderStatus,
  normalizeOrder,
  normalizeOrderStatus,
} from '../config/orderStatus.js';
import { subscribe } from './collectionStore';
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

const LATENCY = 500;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const wait = (ms = LATENCY) => new Promise((resolve) => setTimeout(resolve, ms));

function generateOrderId() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0');
  return `ORD-${stamp}${rand}`;
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
} = {}) {
  await wait();

  const errors = {};

  if (!cartItems.length) {
    errors.cart = 'Your cart is empty.';
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

  const products = await fetchProducts();
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

  // Authoritative totals — recomputed from live prices.
  const totals = calculateTotals(items, { promoCode, fulfillmentType });

  const phone = String(customer.phone || '').trim();
  const normalizedAddress =
    fulfillmentType === 'pickup'
      ? null
      : {
          street: String(address.street || '').trim(),
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

  const now = new Date().toISOString();

  const order = {
    id: generateOrderId(),
    // Multi-tenant tag: every order belongs to exactly one restaurant. The
    // customer-facing store currently produces orders for the deployment's
    // restaurant; the admin dashboard reads orders strictly by restaurantId.
    restaurantId: RESTAURANT_ID,
    customerId: customerId || null,
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
    createdAt: now,
    updatedAt: now,
  };

  addOrder(order);

  return { success: true, order };
}

// --- Order access (ownership is always enforced here) ---

export function getOrderForUser(id, uid) {
  const order = getOrderById(id);
  if (!order) return null;
  // Strict ownership: never expose another customer's order, including legacy
  // orders that have no customerId.
  if (!order.customerId || order.customerId !== uid) return null;
  return normalizeOrder(order);
}

export function getUserOrders(uid) {
  if (!uid) return [];
  return getOrdersForUser(uid).map(normalizeOrder);
}

// --- Restaurant-scoped access (admin dashboard only) ---

// Returns every order that belongs to a restaurant. Data isolation is enforced
// here: the caller passes the signed-in owner's restaurantId and this function
// never returns orders tagged with a different restaurant. Legacy orders (placed
// before the restaurantId field existed) are treated as belonging to the
// deployment restaurant.
export function getRestaurantOrders(restaurantId) {
  if (!restaurantId) return [];
  return getOrders()
    .filter((order) => {
      const rid = order.restaurantId || RESTAURANT_ID;
      return rid === restaurantId;
    })
    .map(normalizeOrder);
}

// Single restaurant-scoped order. Ownership is enforced here the same way the
// list is: an order tagged with a different restaurant is never returned.
export function getRestaurantOrderById(id, restaurantId) {
  if (!id || !restaurantId) return null;
  const order = getOrderById(id);
  if (!order) return null;
  const rid = order.restaurantId || RESTAURANT_ID;
  if (rid !== restaurantId) return null;
  return normalizeOrder(order);
}

// Real-time-ish subscription: fires whenever the order collection changes (new
// order placed, status updated) in this tab. Cross-tab writes are covered by
// the collection store's `storage` bridge.
export function subscribeOrders(listener) {
  return subscribe('orders', listener);
}

// --- Cancellation (the only status change a customer may trigger) ---

export async function cancelOrder(id, uid) {
  await wait(200);
  const order = getOrderById(id);
  if (!order || !order.customerId || order.customerId !== uid) {
    return { success: false, error: 'Order not found.' };
  }
  if (!isOrderCancellable(order)) {
    return {
      success: false,
      error: 'This order can no longer be cancelled. Please contact us for help.',
    };
  }
  const updated = updateOrder(id, {
    orderStatus: ORDER_STATUS.CANCELLED,
    cancelledAt: new Date().toISOString(),
    cancelledBy: 'customer',
  });
  return { success: true, order: normalizeOrder(updated) };
}

// --- Dashboard hook (not exposed to customers) ---

// Kept centralized so the restaurant dashboard drives
// placed → confirmed → preparing → ready | out_for_delivery → delivered (or
// cancelled) without any UI changes. When `restaurantId` is supplied the update
// is rejected unless the order belongs to that restaurant — the admin UI always
// passes the signed-in owner's restaurantId.
export async function updateOrderStatus(id, status, { restaurantId = null } = {}) {
  if (!isValidOrderStatus(status)) {
    return { success: false, error: `Unknown order status: ${status}` };
  }
  const order = getOrderById(id);
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
  const now = new Date().toISOString();
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const updated = updateOrder(id, {
    orderStatus: nextStatus,
    statusUpdatedAt: now,
    statusHistory: [...history, { status: nextStatus, at: now }],
  });
  return { success: true, order: normalizeOrder(updated) };
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
  const products = await fetchProducts();
  return buildReorder(order, products);
}

export default createOrder;
