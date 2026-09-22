import { notify } from './collectionStore';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    /* storage unavailable (e.g. SSR/tests) — keep in-memory only */
  }
}

export function getUserData(uid) {
  return readJSON(`profile-${uid}`, {});
}

export function saveUserData(uid, data) {
  writeJSON(`profile-${uid}`, data);
}

export function getSavedAddresses(uid) {
  return readJSON(`addresses-${uid}`, []);
}

export function saveSavedAddresses(uid, list) {
  writeJSON(`addresses-${uid}`, list);
}

export function getFavorites(uid) {
  return readJSON(`favorites-${uid}`, []);
}

export function saveFavorites(uid, list) {
  writeJSON(`favorites-${uid}`, list);
}

// Cart is stored per-user under an envelope so it can later be pushed to the
// backend as-is (version + updatedAt act as sync metadata).
const CART_VERSION = 1;

export function getCart(uid = 'guest') {
  const stored = readJSON(`cart-${uid}`, null);
  if (stored && Array.isArray(stored.items)) {
    return {
      version: stored.version || CART_VERSION,
      items: stored.items,
      promoCode: stored.promoCode || '',
      updatedAt: stored.updatedAt || null,
    };
  }
  // Tolerate a raw array from older versions.
  if (Array.isArray(stored)) {
    return { version: CART_VERSION, items: stored, promoCode: '', updatedAt: null };
  }
  // First-load migration of the legacy single "cart" key for guests.
  if (uid === 'guest') {
    const legacy = readJSON('cart', null);
    if (Array.isArray(legacy)) {
      return { version: CART_VERSION, items: legacy, promoCode: '', updatedAt: null };
    }
  }
  return { version: CART_VERSION, items: [], promoCode: '', updatedAt: null };
}

export function saveCart(uid = 'guest', cart) {
  writeJSON(`cart-${uid}`, {
    version: CART_VERSION,
    items: cart.items || [],
    promoCode: cart.promoCode || '',
    updatedAt: cart.updatedAt || new Date().toISOString(),
  });
}

export function getOrders() {
  return readJSON('orders', []);
}

export function addOrder(order) {
  const orders = getOrders();
  writeJSON('orders', [order, ...orders]);
  // Let the restaurant dashboard react to the new order without polling.
  notify('orders');
  return order;
}

export function getOrderById(id) {
  return getOrders().find((order) => order.id === id) || null;
}

export function updateOrder(id, patch) {
  const orders = getOrders();
  let updated = null;
  const next = orders.map((order) => {
    if (order.id !== id) return order;
    updated = { ...order, ...patch, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (updated) {
    writeJSON('orders', next);
    notify('orders');
  }
  return updated;
}

export function getOrdersForUser(uid) {
  if (!uid) return [];
  // Strict ownership: an order without a matching customerId is never shown.
  return getOrders().filter((order) => order.customerId === uid);
}

// Removes every per-user key (profile, addresses, favorites, cart). Orders are
// the restaurant's records and are intentionally left in the shared store.
export function removeUserData(uid) {
  if (!uid) return;
  [
    `profile-${uid}`,
    `addresses-${uid}`,
    `favorites-${uid}`,
    `cart-${uid}`,
  ].forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      /* storage unavailable — nothing to clear */
    }
  });
}