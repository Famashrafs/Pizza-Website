// Category service — the single source of truth for menu categories.
//
// Categories are restaurant-scoped documents under the
// `restaurants/{restaurantId}/categories` subcollection, exactly like the
// multi-tenant layout in `firestore.rules`. Every call is async and goes
// through `src/services/db.js`.

import { CATEGORY_ORDER } from '../data/categories';
import db from './db';
import { normalizeCategoryTranslations } from '../utils/menuLocalization.js';
import {
  mergeCategoryTranslations,
  normalizeCategoryTranslations,
} from '../utils/menuTranslations';

const categoriesPath = (restaurantId) => `restaurants/${restaurantId}/categories`;
const categoryPath = (restaurantId, id) => `${categoriesPath(restaurantId)}/${id}`;

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cat-${crypto.randomUUID().slice(0, 13)}`;
  }
  return `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const normalizeName = (name) => String(name || '').trim();

function hydrate(category) {
  if (!category) return null;
  return {
    id: category.id,
    restaurantId: category.restaurantId,
    name: normalizeName(category.name) || 'Category',
    // Optional per-language names (Phase 4). Missing/empty values fall back to
    // the default `name` on the storefront.
    translations: normalizeCategoryTranslations(category.translations),
    description: category.description || '',
    image: category.image || '',
    sortOrder: Number.isFinite(category.sortOrder) ? category.sortOrder : 0,
    translations: category.translations,
    createdAt: db.timestampToISO(category.createdAt) || category.createdAt || null,
    updatedAt: db.timestampToISO(category.updatedAt) || category.updatedAt || null,
  };
}

export async function getCategoriesForRestaurant(restaurantId) {
  if (!restaurantId) return [];
  const docs = await db.getDocs(categoriesPath(restaurantId), {
    orderBy: [{ field: 'sortOrder', dir: 'asc' }],
  });
  return docs.map(hydrate);
}

// Seeds the canonical category set for a restaurant that has no categories yet
// (the deployment restaurant and brand-new owner restaurants alike). Matches
// the old behaviour of materializing `data/categories.js` once per restaurant.
export async function ensureCategories(restaurantId) {
  if (!restaurantId) return [];
  const existing = await getCategoriesForRestaurant(restaurantId);
  if (existing.length) return existing;

  await Promise.all(
    CATEGORY_ORDER.map((name, index) =>
      db.setDoc(categoryPath(restaurantId, `cat-${name.toLowerCase()}`), {
        restaurantId,
        name,
        description: '',
        image: '',
        sortOrder: index,
        createdAt: db.serversNow(),
        updatedAt: db.serversNow(),
      })
    )
  );
  return getCategoriesForRestaurant(restaurantId);
}

export async function getCategoryById(id, restaurantId) {
  if (!id || !restaurantId) return null;
  return hydrate(await db.getDoc(categoryPath(restaurantId, id)));
}

export async function getCategoryByName(restaurantId, name) {
  const clean = normalizeName(name).toLowerCase();
  if (!restaurantId || !clean) return null;
  const matches = await db.getDocs(categoriesPath(restaurantId), {
    where: [{ field: 'name', op: '==', value: name }],
  });
  const found = matches.find((category) => category.name.toLowerCase() === clean);
  return found ? hydrate(found) : null;
}

// Resolves a category for a product being created/edited. Matches by id first,
// then by name, and finally creates the category when the owner typed a new one
// inline. This keeps products and categories from ever drifting apart.
export async function resolveCategory({ restaurantId, categoryId, name }) {
  if (!restaurantId) return null;

  if (categoryId) {
    const byId = await getCategoryById(categoryId, restaurantId);
    if (byId) return byId;
  }

  const byName = await getCategoryByName(restaurantId, name);
  if (byName) return byName;

  if (normalizeName(name)) {
    return createCategory({ restaurantId, name });
  }
  return null;
}

export async function createCategory({
  restaurantId,
  name,
  description = '',
  image = '',
  translations = {},
} = {}) {
  const clean = normalizeName(name);
  if (!restaurantId) throw new Error('A restaurant is required to create a category.');
  if (!clean) throw new Error('Category name is required.');

  const siblings = await getCategoriesForRestaurant(restaurantId);
  const duplicate = siblings.some(
    (category) => category.name.toLowerCase() === clean.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`A category named "${clean}" already exists.`);
  }

  const sortOrder = siblings.length
    ? Math.max(...siblings.map((c) => c.sortOrder)) + 1
    : 0;
  const id = generateId();
  const nextTranslations = normalizeCategoryTranslations(translations);

  await db.setDoc(categoryPath(restaurantId, id), {
    restaurantId,
    name: clean,
    translations: nextTranslations,
    description: String(description || '').trim(),
    image: String(image || '').trim(),
    sortOrder,
    createdAt: db.serversNow(),
    updatedAt: db.serversNow(),
  });

  return hydrate({
    id,
    restaurantId,
    name: clean,
    translations: nextTranslations,
    description,
    image,
    sortOrder,
  });
}

export async function updateCategory(id, patch = {}, restaurantId) {
  if (!id || !restaurantId) return null;
  const existing = await getCategoryById(id, restaurantId);
  if (!existing) return null;

  if (patch.name != null) {
    const clean = normalizeName(patch.name);
    if (!clean) throw new Error('Category name is required.');
    const siblings = await getCategoriesForRestaurant(restaurantId);
    const duplicate = siblings.some(
      (category) => category.id !== id && category.name.toLowerCase() === clean.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A category named "${clean}" already exists.`);
    }
  }

  const { id: _ignoredId, ...safePatch } = patch;
  const translations =
    safePatch.translations !== undefined
      ? mergeCategoryTranslations(existing.translations, safePatch.translations)
      : existing.translations;
  const next = {
    ...existing,
    ...safePatch,
    translations,
    name: patch.name != null ? normalizeName(patch.name) : existing.name,
    updatedAt: db.serversNow(),
  };
  await db.setDoc(categoryPath(restaurantId, id), next);

  // Products carry a denormalized copy of the category name translations so
  // the public storefront can localize category labels without read access to
  // the owner-only categories collection. Keep those copies in sync.
  if (patch.translations !== undefined) {
    await syncProductCategoryTranslations({
      restaurantId,
      category: { id, name: next.name },
      translations,
    });
  }

  return hydrate({ ...next, id, restaurantId });
}

async function syncProductCategoryTranslations({ restaurantId, category, translations }) {
  const products = await db.getDocs('products', {
    where: [{ field: 'restaurantId', op: '==', value: restaurantId }],
  });
  const affected = products.filter(
    (product) =>
      product.categoryId === category.id ||
      (!product.categoryId && product.category === category.name)
  );
  await Promise.all(
    affected.map((product) =>
      db.updateDoc(`products/${product.id}`, {
        categoryTranslations: translations,
        updatedAt: db.serversNow(),
      })
    )
  );
}

// Deletion is blocked while products still reference the category so a menu can
// never end up with orphaned items. Callers surface the returned error.
export async function deleteCategory(id, restaurantId) {
  if (!id || !restaurantId) return { success: false, error: 'Category not found.' };
  const existing = await getCategoryById(id, restaurantId);
  if (!existing) return { success: false, error: 'Category not found.' };

  const products = await db.getDocs('products', {
    where: [{ field: 'restaurantId', op: '==', value: restaurantId }],
  });
  const inUse = products.some(
    (product) =>
      product.categoryId === id ||
      (!product.categoryId && product.category === existing.name)
  );
  if (inUse) {
    return {
      success: false,
      error: 'This category still has products. Move or delete them first.',
    };
  }

  await db.deleteDoc(categoryPath(restaurantId, id));
  return { success: true };
}

export async function reorderCategories(restaurantId, orderedIds = []) {
  if (!restaurantId) return [];
  const orderIndex = new Map(orderedIds.map((id, index) => [id, index]));
  const current = await getCategoriesForRestaurant(restaurantId);

  let fallback = orderedIds.length;
  await Promise.all(
    current.map((category) => {
      const position = orderIndex.has(category.id)
        ? orderIndex.get(category.id)
        : fallback++;
      return db.updateDoc(categoryPath(restaurantId, category.id), {
        sortOrder: position,
        updatedAt: db.serversNow(),
      });
    })
  );
  return getCategoriesForRestaurant(restaurantId);
}

export function subscribeCategories(listener, { restaurantId } = {}) {
  if (!restaurantId) return () => {};
  return db.subscribe(categoriesPath(restaurantId), {}, listener);
}

const categoryService = {
  getCategoriesForRestaurant,
  ensureCategories,
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