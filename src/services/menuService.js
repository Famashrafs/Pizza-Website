// Menu / product service — the single source of truth for the catalog.
//
// Products live in the flat `products` collection of Firestore, tagged with
// `restaurantId`. Both the customer-facing menu and the admin dashboard read
// and write through this module, so an owner creating a product makes it appear
// on the storefront immediately. The customer store is scoped to the deployment
// restaurant; the admin catalog is scoped to the signed-in owner's restaurant.
//
// All calls are async and go through `src/services/db.js`. The public API
// matches the previous localStorage service so the UI (pages, hooks) did not
// have to change its call sites — only become promise-aware.

import seedProducts, {
  getProductCustomizationDefaults,
} from '../data/seedProducts.js';
import { CATEGORY_ORDER } from '../data/categories.js';
import { RESTAURANT_ID } from '../config/restaurant';
import db from './db';
import { resolveCategory } from './categoryService';
import { devLog } from '../utils/devLog';

const COLLECTION = 'products';
const NOT_CATEGORIZED = 'Uncategorized';

export const DEFAULT_PRODUCT_IMAGE = '/images/food.png';

function generateProductId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `prod-${crypto.randomUUID().slice(0, 13)}`;
  }
  return `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Normalizes a stored product document into the exact shape the UI consumes.
// Stored records already carry their category name/id (denormalized), so this
// never has to touch the category collection on read.
function hydrateProduct(product) {
  if (!product) return null;
  const defaults = getProductCustomizationDefaults(product.category);
  const categoryName =
    String(product.category || product.categoryName || '').trim() || NOT_CATEGORIZED;
  const stamp = db.timestampToISO(product.createdAt) || product.createdAt || null;

  return {
    ...product,
    id: product.id,
    restaurantId: product.restaurantId || RESTAURANT_ID,
    category: categoryName,
    categoryId: product.categoryId || null,
    name: String(product.name || 'Untitled item').trim() || 'Untitled item',
    description: String(product.description || '').trim(),
    image: product.image || DEFAULT_PRODUCT_IMAGE,
    basePrice: round2(product.basePrice != null ? product.basePrice : product.price),
    rating: Number(product.rating) || 0,
    available: product.available !== false,
    featured: Boolean(product.featured),
    popular: Boolean(product.popular),
    vegetarian: Boolean(product.vegetarian),
    ingredients: Array.isArray(product.ingredients) ? product.ingredients : [],
    popularity: Number(product.popularity) || 0,
    // Owners can archive an item instead of destroying it (see deleteProduct).
    archived: Boolean(product.archived),
    sizes: Array.isArray(product.sizes) ? product.sizes : defaults.sizes,
    toppings: Array.isArray(product.toppings) ? product.toppings : defaults.toppings,
    crusts: Array.isArray(product.crusts) ? product.crusts : defaults.crusts,
    maxToppings:
      product.maxToppings != null ? product.maxToppings : defaults.maxToppings,
    defaultSize:
      product.defaultSize != null ? product.defaultSize : defaults.defaultSize,
    defaultCrust:
      product.defaultCrust != null ? product.defaultCrust : defaults.defaultCrust,
    createdAt: stamp,
    updatedAt: db.timestampToISO(product.updatedAt) || product.updatedAt || stamp,
  };
}

async function maxSortOrder(restaurantId) {
  const docs = await db.getDocs(COLLECTION, {
    where: [{ field: 'restaurantId', op: '==', value: restaurantId }],
  });
  return docs.reduce((max, doc) => Math.max(max, Number(doc.sortOrder) || 0), 0);
}

export async function ensureDefaultProducts() {
  const existing = await getProductsForRestaurant(RESTAURANT_ID, { includeArchived: true });
  if (existing.length) return existing;

  const { ensureCategories } = await import('./categoryService');
  await ensureCategories(RESTAURANT_ID);

  await Promise.all(
    seedProducts.map((seed, index) => {
      const defaults = getProductCustomizationDefaults(seed.category);
      const categoryName = String(seed.category || '').trim() || NOT_CATEGORIZED;
      const item = {
        id: seed.id,
        restaurantId: RESTAURANT_ID,
        category: categoryName,
        // Categories are seeded with deterministic ids (`cat-<name>`), so the
        // product/category relationship is stable without a lookup.
        categoryId: `cat-${categoryName.toLowerCase()}`,
        name: String(seed.name || 'Untitled item').trim() || 'Untitled item',
        description: String(seed.description || '').trim(),
        image: seed.image || DEFAULT_PRODUCT_IMAGE,
        basePrice: round2(seed.basePrice != null ? seed.basePrice : seed.price),
        rating: Number(seed.rating) || 0,
        available: seed.available !== false,
        featured: Boolean(seed.featured),
        popular: Boolean(seed.popular),
        vegetarian: Boolean(seed.vegetarian),
        ingredients: Array.isArray(seed.ingredients) ? seed.ingredients : [],
        popularity: Number(seed.popularity) || 0,
        archived: false,
        sizes: Array.isArray(seed.sizes) ? seed.sizes : defaults.sizes,
        toppings: Array.isArray(seed.toppings) ? seed.toppings : defaults.toppings,
        crusts: Array.isArray(seed.crusts) ? seed.crusts : defaults.crusts,
        maxToppings:
          seed.maxToppings != null ? seed.maxToppings : defaults.maxToppings,
        defaultSize:
          seed.defaultSize != null ? seed.defaultSize : defaults.defaultSize,
        defaultCrust:
          seed.defaultCrust != null ? seed.defaultCrust : defaults.defaultCrust,
        sortOrder: index,
        createdAt: db.serversNow(),
        updatedAt: db.serversNow(),
      };
      return db.setDoc(`${COLLECTION}/${seed.id}`, item);
    })
  );

  return getProductsForRestaurant(RESTAURANT_ID);
}

// --- Customer-facing reads (scoped to one restaurant) -----------------------

export async function fetchProducts(restaurantId = RESTAURANT_ID) {
  return getProductsForRestaurant(restaurantId);
}

export async function fetchProductById(id) {
  return getProductById(id);
}

// --- Restaurant-scoped reads (admin dashboard) ------------------------------

// Runs the catalog query for one restaurant. Live Firestore needs a composite
// index for `where(restaurantId == X).orderBy(sortOrder)`; when that index is
// missing the read throws `failed-precondition`. We fall back to an
// equality-only query and sort client-side so the menu never hard-fails on a
// missing index, and log the cause in development so the index can be created.
async function queryProducts(restaurantId) {
  const where = [{ field: 'restaurantId', op: '==', value: restaurantId }];
  try {
    return await db.getDocs(COLLECTION, {
      where,
      orderBy: [{ field: 'sortOrder', dir: 'asc' }],
    });
  } catch (err) {
    if (err && err.code === 'failed-precondition') {
      devLog(
        '[menuService] ordered catalog query needs a composite index — falling back to client-side sort. Create the index for: products(restaurantId ASC, sortOrder ASC)',
        err
      );
      const docs = await db.getDocs(COLLECTION, { where });
      docs.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
      return docs;
    }
    throw err;
  }
}

export async function getProductsForRestaurant(restaurantId, { includeArchived = false } = {}) {
  if (!restaurantId) return [];
  const docs = await queryProducts(restaurantId);
  let visible = docs
    .filter((product) => includeArchived || !product.archived)
    .map(hydrateProduct);

  // First-run recovery for the deployment storefront: when Firestore has no
  // products for RESTAURANT_ID at all, seed the default catalog before serving
  // the menu. `ensureDefaultProducts()` is idempotent, never overwrites or
  // deletes, and is hard-scoped to RESTAURANT_ID. Firestore rules only let a
  // restaurant *member* perform the seed write, so a signed-out visitor or a
  // plain customer gets a harmless denied attempt (logged in dev) and the menu
  // simply reflects whatever is actually readable.
  if (!includeArchived && restaurantId === RESTAURANT_ID && visible.length === 0) {
    try {
      await ensureDefaultProducts();
      visible = (await queryProducts(restaurantId))
        .filter((product) => !product.archived)
        .map(hydrateProduct);
    } catch (err) {
      devLog('[menuService] seed-on-read failed (catalog left as-is)', err);
    }
  }

  return visible;
}

export async function getProductById(id) {
  if (!id) return null;
  return hydrateProduct(await db.getDoc(`${COLLECTION}/${id}`));
}

export function getCategories(products) {
  const list = products || [];
  const present = Array.from(new Set(list.map((product) => product.category)));
  present.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return present;
}

// --- Dashboard-ready mutations ---------------------------------------------

// Builds the exact document to persist from arbitrary form input. `id` is
// preserved for edits and generated for new products, `sortOrder` keeps new
// items first (matching the previous "newest on top" behaviour).
async function buildProduct(input, restaurantId, { insertFirst = false } = {}) {
  const category = await resolveCategory({
    restaurantId,
    categoryId: input.categoryId,
    name: input.category,
  });

  const max = await maxSortOrder(restaurantId);
  const prevMin = await minSortOrder(restaurantId);
  const sortOrder = insertFirst ? prevMin - 1 : max + 1;

  return hydrateProduct({
    ...input,
    id: input.id || generateProductId(),
    restaurantId,
    category: category ? category.name : input.category,
    categoryId: category ? category.id : input.categoryId || null,
    sortOrder: input.sortOrder != null ? input.sortOrder : sortOrder,
    createdAt: input.createdAt || db.serversNow(),
    updatedAt: db.serversNow(),
  });
}

async function minSortOrder(restaurantId) {
  const docs = await db.getDocs(COLLECTION, {
    where: [{ field: 'restaurantId', op: '==', value: restaurantId }],
  });
  if (!docs.length) return 0;
  return docs.reduce(
    (min, doc) => Math.min(min, Number(doc.sortOrder) || 0),
    Number(docs[0].sortOrder) || 0
  );
}

export async function createProduct(input, restaurantId = RESTAURANT_ID) {
  const name = String(input?.name || '').trim();
  if (!name) throw new Error('Product name is required.');
  if (!restaurantId) throw new Error('A restaurant is required.');

  const product = await buildProduct(
    {
      ...input,
      name,
      id: input?.id,
    },
    restaurantId,
    { insertFirst: true }
  );
  const { id, ...data } = product;
  await db.setDoc(`${COLLECTION}/${id}`, data);
  return (await getProductById(id)) || product;
}

export async function updateProduct(id, patch = {}) {
  const existing = await getProductById(id);
  if (!existing) return null;

  const { id: _ignoredId, ...safePatch } = patch;
  const merged = await buildProduct(
    {
      ...existing,
      ...safePatch,
      id,
      restaurantId: existing.restaurantId,
      createdAt: existing.createdAt || db.nowISO(),
    },
    existing.restaurantId
  );
  const { id: _mergeId, ...data } = merged;
  await db.setDoc(`${COLLECTION}/${id}`, data);
  return (await getProductById(id)) || merged;
}

export async function setAvailability(id, available) {
  return updateProduct(id, { available: Boolean(available) });
}

export async function setFeatured(id, featured) {
  return updateProduct(id, { featured: Boolean(featured) });
}

export async function setPrice(id, basePrice) {
  return updateProduct(id, { basePrice: round2(basePrice) });
}

// True when a product appears in any historical order. Order lines snapshot the
// product name/price, so history is never at risk — but we still avoid hard
// deleting referenced products to keep the catalog stable for reporting.
export async function isProductReferenced(id, restaurantId = RESTAURANT_ID) {
  if (!id || !restaurantId) return false;
  const orders = await db.getDocs('orders', {
    where: [{ field: 'restaurantId', op: '==', value: restaurantId }],
  });
  return orders.some((order) =>
    (order.items || []).some((item) => item.productId === id)
  );
}

// Deletes a product. Unreferenced products are removed from the catalog;
// products that appear in order history are archived (hidden from the menu,
// `available: false`) so historical orders and reports stay intact.
export async function deleteProduct(id) {
  const product = await getProductById(id);
  if (!product) return { success: false, error: 'Product not found.' };
  const restaurantId = product.restaurantId || RESTAURANT_ID;

  if (await isProductReferenced(id, restaurantId)) {
    const archived = await updateProduct(id, { archived: true, available: false });
    return { success: true, mode: 'archived', product: archived };
  }

  await db.deleteDoc(`${COLLECTION}/${id}`);
  return { success: true, mode: 'deleted' };
}

export async function archiveProduct(id) {
  return updateProduct(id, { archived: true, available: false });
}

export async function restoreProduct(id) {
  return updateProduct(id, { archived: false, available: true });
}

export function subscribeProducts(listener, { restaurantId } = {}) {
  if (!restaurantId) return () => {};
  return db.subscribe(
    COLLECTION,
    { where: [{ field: 'restaurantId', op: '==', value: restaurantId }] },
    listener
  );
}

const menuService = {
  fetchProducts,
  fetchProductById,
  getProductsForRestaurant,
  getProductById,
  getCategories,
  createProduct,
  updateProduct,
  setAvailability,
  setFeatured,
  setPrice,
  isProductReferenced,
  deleteProduct,
  archiveProduct,
  restoreProduct,
  subscribeProducts,
};

export default menuService;