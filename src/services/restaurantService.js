// Restaurant records — the hub of multi-tenant data isolation.
//
// Every restaurant-owned resource (orders, products, categories, …) carries a
// `restaurantId`. This module owns the restaurant documents themselves, the
// Owner -> Restaurant relationship, and the restaurant's business settings
// (identity, branding, hours, delivery).
//
// Storage note: the project currently persists to localStorage (mirroring the
// product/order stores). The API is deliberately backend-shaped so it can move
// to Firestore without changing callers. See `firestore.rules` and the README.

import { RESTAURANT_ID, RESTAURANT_SETTINGS } from '../config/restaurant';
import {
  readCollection,
  subscribe,
  writeCollection,
} from './collectionStore';

const STORAGE_KEY = 'restaurants';
const COLLECTION = 'restaurants';
const LATENCY = 300;

const now = () => new Date().toISOString();
const wait = (ms = LATENCY) => new Promise((resolve) => setTimeout(resolve, ms));

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

function readAll() {
  const parsed = readCollection(STORAGE_KEY, null);
  return Array.isArray(parsed) ? parsed : [];
}

function writeAll(restaurants) {
  return writeCollection(STORAGE_KEY, restaurants, COLLECTION);
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
    ownerId: null,
    branches: [],
    ...defaultSettings(),
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
  return getRestaurants().find((record) => record.ownerId === ownerId) || null;
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
    ...defaultSettings(),
    createdAt: now(),
    updatedAt: now(),
    ...extra,
  };

  writeAll([restaurant, ...list]);
  return restaurant;
}

export function updateRestaurant(id, patch = {}) {
  const list = ensureDefaultRestaurant();
  const existing = list.find((record) => record.id === id);
  if (!existing) return null;

  // Never allow the record id to be overwritten through a settings form.
  const { id: _ignoredId, ...safePatch } = patch;

  let updated = null;
  const next = list.map((record) => {
    if (record.id !== id) return record;
    updated = { ...record, ...safePatch, updatedAt: now() };
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

export function subscribeRestaurant(listener) {
  return subscribe(COLLECTION, listener);
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

export const RESTAURANT_STORAGE_KEY = STORAGE_KEY;

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
};

export default restaurantService;
