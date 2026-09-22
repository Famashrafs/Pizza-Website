// Lightweight reactive collection store built on top of localStorage.
//
// The project persists to localStorage today; Firestore is the documented
// production backend (see `firestore.rules` and the README). Regardless of the
// backend, the UI needs to react when a collection changes — from the admin
// dashboard, from the customer store, or from another browser tab. This module
// provides the tiny pub/sub layer that makes that possible without polling.
//
// Every service that owns a collection reads through `readCollection` and
// writes through `writeCollection`, which emits automatically. Subscribers are
// notified for same-tab writes and, via the `storage` event, for cross-tab
// writes too — so an owner's dashboard updates the moment a customer orders.

const listeners = new Map();

export function subscribe(collection, listener) {
  if (typeof listener !== 'function') return () => {};
  if (!listeners.has(collection)) listeners.set(collection, new Set());
  const set = listeners.get(collection);
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(collection);
  };
}

export function notify(collection) {
  const set = listeners.get(collection);
  if (!set) return;
  // Copy first: a listener may unsubscribe while we iterate.
  Array.from(set).forEach((listener) => {
    try {
      listener();
    } catch (err) {
      // A broken subscriber must never break the writer.
    }
  });
}

// Maps storage keys to logical collections so a write from another tab (which
// only fires a `storage` event, never our in-memory notify) reaches subscribers.
const KEY_TO_COLLECTION = {
  'menu-products-v2': 'products',
  'menu-categories-v1': 'categories',
  restaurants: 'restaurants',
  orders: 'orders',
};

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (event) => {
    if (!event || !event.key) return;
    const collection = KEY_TO_COLLECTION[event.key];
    if (collection) notify(collection);
  });
}

export function readCollection(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (err) {
    return fallback;
  }
}

export function writeCollection(key, value, collection) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // storage unavailable — callers keep their in-memory copy
  }
  if (collection) notify(collection);
  return value;
}

const collectionStore = { subscribe, notify, readCollection, writeCollection };

export default collectionStore;
