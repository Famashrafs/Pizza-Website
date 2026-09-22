// Category service — the single source of truth for menu categories.
//
// Categories are restaurant-scoped exactly like products and orders: every
// record carries a `restaurantId`, and callers only ever ask for the categories
// that belong to their restaurant. Storage mirrors the rest of the project
// (localStorage with a backend-shaped API) so it can move to Firestore without
// changing callers.

import { CATEGORY_ORDER } from '../data/categories';
import { RESTAURANT_ID } from '../config/restaurant';
import {
  readCollection,
  subscribe,
  writeCollection,
} from './collectionStore';

const STORAGE_KEY = 'menu-categories-v1';
const PRODUCTS_KEY = 'menu-products-v2';
const COLLECTION = 'categories';

const now = () => new Date().toISOString();

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cat-${crypto.randomUUID().slice(0, 13)}`;
  }
  return `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeName(name) {
  return String(name || '').trim();
}

function hydrateCategory(record, index) {
  return {
    id: record.id || generateId(),
    restaurantId: record.restaurantId || RESTAURANT_ID,
    name: normalizeName(record.name) || 'Category',
    description: record.description || '',
    image: record.image || '',
    sortOrder: Number.isFinite(record.sortOrder) ? record.sortOrder : index,
    createdAt: record.createdAt || now(),
    updatedAt: record.updatedAt || now(),
  };
}

function readRaw() {
  const parsed = readCollection(STORAGE_KEY, null);
  return Array.isArray(parsed) ? parsed.map(hydrateCategory) : null;
}

function writeAll(categories) {
  return writeCollection(STORAGE_KEY, categories, COLLECTION);
}

// The canonical categories ship as configuration (data/categories.js) and are
// materialized once, the same way the menu seeds its products. Categories are
// configuration — not fabricated statistics — so this never invents data for a
// restaurant that already has its own categories.
function ensureSeeded() {
  const existing = readRaw();
  if (existing) return existing;
  const seeded = CATEGORY_ORDER.map((name, index) =>
    hydrateCategory({ id: `cat-${name.toLowerCase()}`, name, sortOrder: index }, index)
  );
  writeAll(seeded);
  return seeded;
}

// Seeds the canonical categories for a restaurant that has none yet (e.g. a
// brand-new owner). Ids are namespaced by restaurant so two restaurants can
// never collide on the same category id.
function seedForRestaurant(restaurantId, list) {
  const seeded = CATEGORY_ORDER.map((name, index) =>
    hydrateCategory(
      {
        id: `${restaurantId}__cat-${name.toLowerCase()}`,
        restaurantId,
        name,
        sortOrder: index,
      },
      index
    )
  );
  writeAll([...list, ...seeded]);
  return seeded;
}

export function getCategoriesForRestaurant(restaurantId) {
  if (!restaurantId) return [];
  const list = ensureSeeded();
  let mine = list.filter((category) => category.restaurantId === restaurantId);
  if (mine.length === 0 && restaurantId !== RESTAURANT_ID) {
    mine = seedForRestaurant(restaurantId, list);
  }
  return mine.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getCategoryById(id) {
  if (!id) return null;
  return ensureSeeded().find((category) => category.id === id) || null;
}

export function getCategoryByName(restaurantId, name) {
  const clean = normalizeName(name).toLowerCase();
  if (!clean) return null;
  return (
    getCategoriesForRestaurant(restaurantId).find(
      (category) => category.name.toLowerCase() === clean
    ) || null
  );
}

// Resolves a category for a product being created/edited. Matches by id first,
// then by name, and finally creates the category when the owner typed a new one
// inline. This keeps products and categories from ever drifting apart.
export function resolveCategory({ restaurantId, categoryId, name }) {
  const byId = categoryId ? getCategoryById(categoryId) : null;
  if (byId && byId.restaurantId === restaurantId) return byId;

  const byName = getCategoryByName(restaurantId, name);
  if (byName) return byName;

  if (normalizeName(name)) {
    return createCategory({ restaurantId, name });
  }
  return null;
}

export function createCategory({ restaurantId, name, description = '', image = '' } = {}) {
  const clean = normalizeName(name);
  if (!restaurantId) throw new Error('A restaurant is required to create a category.');
  if (!clean) throw new Error('Category name is required.');

  const list = ensureSeeded();
  const duplicate = list.some(
    (category) =>
      category.restaurantId === restaurantId &&
      category.name.toLowerCase() === clean.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`A category named "${clean}" already exists.`);
  }

  const siblings = list.filter((c) => c.restaurantId === restaurantId);
  const sortOrder = siblings.length
    ? Math.max(...siblings.map((c) => c.sortOrder)) + 1
    : 0;

  const category = hydrateCategory(
    {
      id: generateId(),
      restaurantId,
      name: clean,
      description: String(description || '').trim(),
      image: String(image || '').trim(),
      sortOrder,
      createdAt: now(),
      updatedAt: now(),
    },
    sortOrder
  );

  writeAll([...list, category]);
  return category;
}

export function updateCategory(id, patch = {}) {
  const list = ensureSeeded();
  const existing = list.find((category) => category.id === id);
  if (!existing) return null;

  if (patch.name != null) {
    const clean = normalizeName(patch.name);
    if (!clean) throw new Error('Category name is required.');
    const duplicate = list.some(
      (category) =>
        category.id !== id &&
        category.restaurantId === existing.restaurantId &&
        category.name.toLowerCase() === clean.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A category named "${clean}" already exists.`);
    }
  }

  let updated = null;
  const next = list.map((category) => {
    if (category.id !== id) return category;
    updated = {
      ...category,
      ...patch,
      name: patch.name != null ? normalizeName(patch.name) : category.name,
      updatedAt: now(),
    };
    return updated;
  });
  writeAll(next);
  return updated;
}

// Deletion is blocked while products still reference the category so a menu can
// never end up with orphaned items. Callers surface the returned error.
export function deleteCategory(id) {
  const list = ensureSeeded();
  const category = list.find((entry) => entry.id === id);
  if (!category) return { success: false, error: 'Category not found.' };

  const products = readCollection(PRODUCTS_KEY, []);
  const inUse = (Array.isArray(products) ? products : []).some(
    (product) =>
      product.categoryId === id ||
      (!product.categoryId && product.category === category.name)
  );
  if (inUse) {
    return {
      success: false,
      error: 'This category still has products. Move or delete them first.',
    };
  }

  writeAll(list.filter((entry) => entry.id !== id));
  return { success: true };
}

export function reorderCategories(restaurantId, orderedIds = []) {
  const list = ensureSeeded();
  const orderIndex = new Map(orderedIds.map((id, index) => [id, index]));
  let fallback = orderedIds.length;
  const next = list.map((category) => {
    if (category.restaurantId !== restaurantId) return category;
    const position = orderIndex.has(category.id)
      ? orderIndex.get(category.id)
      : fallback++;
    return { ...category, sortOrder: position, updatedAt: now() };
  });
  writeAll(next);
  return getCategoriesForRestaurant(restaurantId);
}

export function subscribeCategories(listener) {
  return subscribe(COLLECTION, listener);
}

export const CATEGORY_STORAGE_KEY = STORAGE_KEY;

const categoryService = {
  getCategoriesForRestaurant,
  getCategoryById,
  getCategoryByName,
  resolveCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  subscribeCategories,
};

export default categoryService;
