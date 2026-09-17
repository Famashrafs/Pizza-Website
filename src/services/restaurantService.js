// Restaurant records — the hub of multi-tenant data isolation.
//
// Every restaurant-owned resource (orders, products, …) carries a
// `restaurantId`. This module owns the restaurant documents themselves and the
// Owner -> Restaurant relationship.
//
// Storage note: the project currently persists to localStorage (mirroring the
// existing product/order stores). The API is deliberately backend-shaped so it
// can move to Firestore without changing callers: createRestaurant /
// getRestaurantById / updateRestaurant / getOwnerRestaurant. See
// `firestore.rules` and the README for the production configuration.

import { RESTAURANT_ID, RESTAURANT_SETTINGS } from '../config/restaurant';

const STORAGE_KEY = 'restaurants';
const LATENCY = 300;

const now = () => new Date().toISOString();
const wait = (ms = LATENCY) => new Promise((resolve) => setTimeout(resolve, ms));

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `rest-${crypto.randomUUID().slice(0, 13)}`;
  }
  return `rest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    /* storage unavailable — fall through to in-memory default */
  }
  return [];
}

function writeAll(restaurants) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restaurants));
  } catch (err) {
    /* storage unavailable — keep in-memory only */
  }
}

// Materializes the deployment's restaurant record from config when no restaurant
// exists yet. This mirrors how the menu store seeds products from config data;
// it is the restaurant's own record (identity/settings), never dashboard stats.
function ensureDefaultRestaurant() {
  const list = readAll();
  if (list.some((record) => record.id === RESTAURANT_ID)) return list;

  const record = {
    id: RESTAURANT_ID,
    name: RESTAURANT_SETTINGS.name,
    tagline: RESTAURANT_SETTINGS.tagline,
    phone: RESTAURANT_SETTINGS.phone,
    email: RESTAURANT_SETTINGS.email,
    address: RESTAURANT_SETTINGS.pickup?.address || '',
    openingHours: RESTAURANT_SETTINGS.pickup?.hours || '',
    ownerId: null,
    branches: [],
    createdAt: now(),
    updatedAt: now(),
  };
  const next = [record, ...list];
  writeAll(next);
  return next;
}

export function getRestaurants() {
  return ensureDefaultRestaurant();
}

export function getRestaurantById(id) {
  if (!id) return null;
  return getRestaurants().find((record) => record.id === id) || null;
}

export function getOwnerRestaurant(ownerId) {
  if (!ownerId) return null;
  return (
    getRestaurants().find((record) => record.ownerId === ownerId) || null
  );
}

export async function fetchOwnerRestaurant(ownerId) {
  await wait();
  return getOwnerRestaurant(ownerId);
}

export function createRestaurant({ ownerId = null, name, ...extra } = {}) {
  const trimmedName = String(name || '').trim();
  const list = ensureDefaultRestaurant();

  const restaurant = {
    id: generateId(),
    name: trimmedName || 'My Restaurant',
    ownerId,
    branches: [],
    createdAt: now(),
    updatedAt: now(),
    ...extra,
  };

  writeAll([restaurant, ...list]);
  return restaurant;
}

export function updateRestaurant(id, patch) {
  const list = ensureDefaultRestaurant();
  let updated = null;
  const next = list.map((record) => {
    if (record.id !== id) return record;
    updated = { ...record, ...patch, updatedAt: now() };
    return updated;
  });
  if (updated) writeAll(next);
  return updated;
}

export function setRestaurantOwner(id, ownerId) {
  return updateRestaurant(id, {
    ownerId,
    ownerTakenAt: now(),
  });
}

// --- Onboarding: User -> Restaurant -> Owner ------------------------------
//
// A new owner either takes over the deployment's (unclaimed) restaurant, which
// keeps the existing local store coherent, or — when that restaurant already
// has an owner — creates a brand-new restaurant that is fully isolated. Either
// way the returned restaurant becomes the owner's `restaurantId`.
export function onboardOwnerRestaurant({ ownerId, name }) {
  if (!ownerId) return null;

  const claimed = getRestaurantById(RESTAURANT_ID);
  if (claimed && !claimed.ownerId) {
    return setRestaurantOwner(claimed.id, ownerId);
  }

  return createRestaurant({
    ownerId,
    name: String(name || '').trim() || RESTAURANT_SETTINGS.name,
  });
}

const restaurantService = {
  getRestaurants,
  getRestaurantById,
  getOwnerRestaurant,
  fetchOwnerRestaurant,
  createRestaurant,
  updateRestaurant,
  setRestaurantOwner,
  onboardOwnerRestaurant,
};

export default restaurantService;