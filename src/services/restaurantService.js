// Restaurant records — the hub of multi-tenant data isolation.
//
// Every restaurant-owned resource (orders, products, categories, …) carries a
// `restaurantId`. This module owns the restaurant documents themselves, the
// Owner -> Restaurant relationship, and the restaurant's business settings
// (identity, branding, hours, delivery).
//
// Persistence: documents live in the `restaurants` collection of Firestore.
// Reads/writes go through `src/services/db.js`, which centralizes timestamp
// handling. The API surface is unchanged from the localStorage era so callers
// did not have to move — but every function is now async.

import { RESTAURANT_ID, RESTAURANT_SETTINGS } from '../config/restaurant';
import db from './db';

const COLLECTION = 'restaurants';
const path = (id) => `${COLLECTION}/${id}`;

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `rest-${crypto.randomUUID().slice(0, 13)}`;
  }
  return `rest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// The full set of owner-editable business settings. Keeping the shape in one
// place means a new restaurant and the seeded deployment restaurant never drift.
function defaultSettings() {
  return {
    description: RESTAURANT_SETTINGS.tagline || '',
    logo: '',
    coverImage: '',
    tagline: RESTAURANT_SETTINGS.tagline || '',
    phone: RESTAURANT_SETTINGS.phone || '',
    email: RESTAURANT_SETTINGS.email || '',
    address: RESTAURANT_SETTINGS.pickup?.address || '',
    openingHours: RESTAURANT_SETTINGS.pickup?.hours || '',
    currency: RESTAURANT_SETTINGS.currency || '$',
    taxRate: RESTAURANT_SETTINGS.taxRate ?? 0,
    minOrder: RESTAURANT_SETTINGS.minOrder ?? 0,
    deliveryEnabled: true,
    deliveryFee: RESTAURANT_SETTINGS.delivery?.baseFee ?? 0,
    freeDeliveryThreshold: RESTAURANT_SETTINGS.delivery?.freeDeliveryThreshold ?? 0,
  };
}

function normalize(record) {
  if (!record) return null;
  return {
    ...record,
    id: record.id,
    createdAt: db.timestampToISO(record.createdAt) || record.createdAt || null,
    updatedAt: db.timestampToISO(record.updatedAt) || record.updatedAt || null,
    ownerTakenAt: db.timestampToISO(record.ownerTakenAt) || record.ownerTakenAt || null,
  };
}

export async function getRestaurants() {
  const docs = await db.getDocs(COLLECTION);
  return docs.map(normalize);
}

export async function getRestaurantById(id) {
  if (!id) return null;
  return normalize(await db.getDoc(path(id)));
}

export async function getOwnerRestaurant(ownerId) {
  if (!ownerId) return null;
  const matches = await db.getDocs(COLLECTION, {
    where: [{ field: 'ownerId', op: '==', value: ownerId }],
  });
  return matches.length ? normalize(matches[0]) : null;
}

export async function fetchOwnerRestaurant(ownerId) {
  return getOwnerRestaurant(ownerId);
}

export async function createRestaurant({ ownerId = null, name, id, ...extra } = {}) {
  const trimmedName = String(name || '').trim();
  const restaurantId = id || generateId();
  const data = {
    id: restaurantId,
    name: trimmedName || 'My Restaurant',
    ownerId,
    branches: [],
    ...defaultSettings(),
    createdAt: db.serversNow(),
    updatedAt: db.serversNow(),
    ...extra,
  };
  await db.setDoc(path(restaurantId), data);
  return (await getRestaurantById(restaurantId)) || { ...data, id: restaurantId };
}

export async function updateRestaurant(id, patch = {}) {
  if (!id) return null;
  const existing = await getRestaurantById(id);
  if (!existing) return null;

  // Never allow the record id to be overwritten through a settings form.
  const { id: _ignoredId, ...safePatch } = patch;

  const next = {
    ...existing,
    ...safePatch,
    updatedAt: db.serversNow(),
  };
  await db.setDoc(path(id), next);
  return getRestaurantById(id);
}

export async function setRestaurantOwner(id, ownerId) {
  return updateRestaurant(id, {
    ownerId,
    ownerTakenAt: db.serversNow(),
  });
}

// Real-time listener over the owner's own restaurants (single-owner apps see
// exactly one). Returns an unsubscribe function.
export function subscribeRestaurant(listener, { ownerId } = {}) {
  if (!ownerId) return () => {};
  return db.subscribe(
    COLLECTION,
    { where: [{ field: 'ownerId', op: '==', value: ownerId }] },
    listener
  );
}

// --- Onboarding: User -> Restaurant -> Owner ------------------------------
//
// A new owner either takes over the deployment restaurant (when it exists and
// is unclaimed) or claims a brand-new restaurant that is fully isolated. Either
// way the returned restaurant becomes the owner's `restaurantId` and its menu
// is seeded so the dashboard starts with a working catalog (matching the old
// localStorage behaviour).

// Seeds the menu for a restaurant that has already been claimed by its owner.
// This must run AFTER the owner's `users/{uid}` document carries the
// restaurant identity, because the rules only let a *member* write a
// restaurant's categories and products. It is idempotent and best-effort.
export async function seedOwnerSetup(restaurantId) {
  if (!restaurantId) return;
  try {
    const { ensureCategories } = await import('./categoryService');
    await ensureCategories(restaurantId);
    if (restaurantId === RESTAURANT_ID) {
      const { ensureDefaultProducts } = await import('./menuService');
      await ensureDefaultProducts();
    }
  } catch (err) {
    // A partial failure must never block the owner's onboarding.
  }
}

export async function onboardOwnerRestaurant({ ownerId, name }) {
  if (!ownerId) return null;

  const claimed = await getRestaurantById(RESTAURANT_ID);
  let restaurant = null;

  if (claimed && !claimed.ownerId) {
    restaurant = await setRestaurantOwner(claimed.id, ownerId);
  } else if (claimed && claimed.ownerId === ownerId) {
    restaurant = claimed;
  } else if (claimed && claimed.ownerId) {
    restaurant = await createRestaurant({
      ownerId,
      name: String(name || '').trim() || RESTAURANT_SETTINGS.name,
    });
  } else {
    restaurant = await createRestaurant({
      ownerId,
      name: String(name || '').trim() || RESTAURANT_SETTINGS.name,
      id: RESTAURANT_ID,
    });
  }

  return restaurant;
}

const restaurantService = {
  getRestaurants,
  getRestaurantById,
  getOwnerRestaurant,
  fetchOwnerRestaurant,
  createRestaurant,
  updateRestaurant,
  setRestaurantOwner,
  subscribeRestaurant,
  onboardOwnerRestaurant,
  seedOwnerSetup,
};

export default restaurantService;