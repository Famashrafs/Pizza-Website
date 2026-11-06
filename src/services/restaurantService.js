// The single restaurant document owned by this deployment.
//
// Every restaurant-owned resource (orders, products, categories) carries the
// same `restaurantId` from `src/config/restaurant.js`. This module only exposes
// the fixed restaurant: there is no restaurant creation, claiming or listing
// API. Owner -> restaurant verification lives in Firestore Security Rules and
// is re-checked during owner-profile recovery.

import { RESTAURANT_ID, RESTAURANT_SETTINGS } from '../config/restaurant';
import db from './db';

const COLLECTION = 'restaurants';
const path = (id) => `${COLLECTION}/${id}`;

// The full set of owner-editable business settings. Keeping the shape in one
// place means the deployment restaurant never drifts from the admin form.
function defaultSettings() {
  return {
    description: RESTAURANT_SETTINGS.description || RESTAURANT_SETTINGS.tagline || '',
    logo: RESTAURANT_SETTINGS.logo || '',
    coverImage: RESTAURANT_SETTINGS.coverImage || '',
    tagline: RESTAURANT_SETTINGS.tagline || '',
    phone: RESTAURANT_SETTINGS.phone || '',
    email: RESTAURANT_SETTINGS.email || '',
    address: RESTAURANT_SETTINGS.pickup?.address || '',
    openingHours: RESTAURANT_SETTINGS.pickup?.hours || '',
    currency: RESTAURANT_SETTINGS.currency || '$',
    taxRate: RESTAURANT_SETTINGS.taxRate ?? 0,
    minOrder: RESTAURANT_SETTINGS.minOrder ?? 0,
    deliveryEnabled: RESTAURANT_SETTINGS.fulfillment?.deliveryEnabled !== false,
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

export function getDefaultRestaurantSettings() {
  return defaultSettings();
}

export async function getRestaurantById(id = RESTAURANT_ID) {
  if (id !== RESTAURANT_ID) return null;
  return normalize(await db.getDoc(path(id)));
}

// Resolves the settings the whole storefront should use for pricing and
// estimates. The Firestore `restaurants/{RESTAURANT_ID}` document — which the
// AdminSettings page edits via `updateRestaurant` — is authoritative; the
// static RESTAURANT_SETTINGS constants are only a fallback for fields the
// document does not carry yet.
function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function getRestaurantSettings(restaurantId = RESTAURANT_ID) {
  const restaurant = await getRestaurantById(restaurantId);
  const base = RESTAURANT_SETTINGS;
  return {
    name: restaurant?.name || base.name,
    tagline: restaurant?.tagline || base.tagline,
    phone: restaurant?.phone || base.phone,
    email: restaurant?.email || base.email,
    currency: String(restaurant?.currency || base.currency || '$').trim() || '$',
    taxRate: numberOr(restaurant?.taxRate, base.taxRate),
    minOrder: numberOr(restaurant?.minOrder, base.minOrder),
    deliveryEnabled: restaurant
      ? restaurant.deliveryEnabled !== false
      : base.fulfillment.deliveryEnabled !== false,
    delivery: {
      baseFee: numberOr(restaurant?.deliveryFee, base.delivery.baseFee),
      freeDeliveryThreshold: numberOr(
        restaurant?.freeDeliveryThreshold,
        base.delivery.freeDeliveryThreshold
      ),
      estimatedMinutes: base.delivery.estimatedMinutes,
    },
    pickup: {
      address: restaurant?.address || base.pickup.address,
      hours: restaurant?.openingHours || base.pickup.hours,
      estimatedMinutes: base.pickup.estimatedMinutes,
    },
  };
}

export async function updateRestaurant(id, patch = {}) {
  if (id !== RESTAURANT_ID) return null;
  const existing = await getRestaurantById(id);
  if (!existing) return null;

  // Never allow the record id or ownership to be overwritten through settings.
  const {
    id: _ignoredId,
    ownerId: _ignoredOwnerId,
    ownerTakenAt: _ignoredOwnerTakenAt,
    ...safePatch
  } = patch;

  const next = {
    ...existing,
    ...safePatch,
    updatedAt: db.serversNow(),
  };
  await db.setDoc(path(id), next);
  // Return the committed value directly. A post-write read failure must not be
  // reported as a failed save (which could trigger deletion of a new image
  // that Firestore already references).
  return normalize({ ...next, id });
}

// Real-time listener over the single restaurant document. Returns an
// unsubscribe function.
export function subscribeRestaurant(listener) {
  return db.subscribeDoc(path(RESTAURANT_ID), listener);
}

// Seeds the menu for the deployment restaurant. It is idempotent and
// best-effort so a partial failure never blocks owner recovery.
export async function seedOwnerSetup(restaurantId = RESTAURANT_ID) {
  if (restaurantId !== RESTAURANT_ID) return;
  try {
    const { ensureCategories } = await import('./categoryService');
    await ensureCategories(restaurantId);
    const { ensureDefaultProducts } = await import('./menuService');
    await ensureDefaultProducts();
  } catch (err) {
    // A partial failure must never block the owner's recovery.
  }
}

const restaurantService = {
  getDefaultRestaurantSettings,
  getRestaurantById,
  getRestaurantSettings,
  updateRestaurant,
  subscribeRestaurant,
  seedOwnerSetup,
};

export default restaurantService;
