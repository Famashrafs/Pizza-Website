// Client-side storage for data that is explicitly local to a device or user
// session and NOT part of the multi-tenant business layer.
//
// Firestore now owns the authoritative copies of profiles (users), restaurants,
// products, categories and orders. This module keeps only:
//   - the cart (a client-side draft until checkout),
//   - saved addresses (kept local this phase),
//   - favorites,
//   - per-user client preferences and payment-method *metadata* (safe labels,
//     never raw card data) under the `profile-${uid}` key.
//
// Account fields that feed the Firestore profile (name, email, phone, role,
// restaurant ownership) must NOT live here — they are written through
// `accountService`/`AuthContext` into `users/{uid}`.

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

// Client preferences & payment-method metadata (never business-critical fields).
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

// Removes every per-user key this module owns (profile prefs, addresses,
// favorites, cart). Orders and other Firestore documents belong to the server
// and are intentionally left in place.
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