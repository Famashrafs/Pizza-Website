// Menu / product service — the single source of truth for the catalog.
//
// Both the customer-facing menu and the admin dashboard read and write through
// this module, so an owner creating a product makes it appear on the storefront
// immediately (no duplicate arrays). Every product is restaurant-scoped via
// `restaurantId`; the customer store is scoped to the deployment restaurant.
//
// Storage note: persists to localStorage today (Firestore is the documented
// production backend). Writes emit through the collection store so subscribed
// UI updates without polling.

import seedProducts, {
  getProductCustomizationDefaults,
} from '../data/seedProducts.js';
import { CATEGORY_ORDER } from '../data/categories.js';
import { RESTAURANT_ID } from '../config/restaurant';
import {
  readCollection,
  subscribe,
  writeCollection,
} from './collectionStore';
import { getCategoryByName, resolveCategory } from './categoryService';

const STORAGE_KEY = 'menu-products-v2';
const ORDERS_KEY = 'orders';
const COLLECTION = 'products';
const LATENCY = 400;

export const DEFAULT_PRODUCT_IMAGE = '/images/food.png';

function generateProductId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `prod-${crypto.randomUUID().slice(0, 13)}`;
  }
  return `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function hydrateProduct(product) {
  const defaults = getProductCustomizationDefaults(product.category);
  const restaurantId = product.restaurantId || RESTAURANT_ID;
  const categoryName =
    String(product.category || product.categoryName || '').trim() || 'Uncategorized';
  const stamp = product.createdAt || new Date().toISOString();

  // Every product carries a categoryId relationship. Legacy/seeded products only
  // have a category name, so resolve it (creating the category if necessary).
  let categoryId = product.categoryId || null;
  if (!categoryId) {
    const existing = getCategoryByName(restaurantId, categoryName);
    categoryId = existing
      ? existing.id
      : resolveCategory({ restaurantId, name: categoryName })?.id || null;
  }

  return {
    ...product,
    id: product.id || generateProductId(),
    restaurantId,
    category: categoryName,
    categoryId,
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
    updatedAt: product.updatedAt || stamp,
  };
}

function readAll() {
  const parsed = readCollection(STORAGE_KEY, null);
  if (Array.isArray(parsed)) {
    const hydrated = parsed.map(hydrateProduct);
    // Persist the hydrated shape when the stored records were missing fields
    // (e.g. products created before the category/timestamp model existed).
    if (JSON.stringify(hydrated) !== JSON.stringify(parsed)) {
      writeCollection(STORAGE_KEY, hydrated, null);
    }
    return hydrated;
  }
  const seeded = seedProducts.map((product) => hydrateProduct({ ...product }));
  writeCollection(STORAGE_KEY, seeded, null);
  return seeded;
}

function writeAll(products) {
  return writeCollection(STORAGE_KEY, products, COLLECTION);
}

const wait = (ms = LATENCY) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Customer-facing reads (scoped to one restaurant) -----------------------

export async function fetchProducts(restaurantId = RESTAURANT_ID) {
  await wait();
  return getProductsForRestaurant(restaurantId);
}

export async function fetchProductById(id) {
  await wait(200);
  return getProductById(id);
}

// --- Restaurant-scoped reads (admin dashboard) ------------------------------

export function getProductsForRestaurant(restaurantId, { includeArchived = false } = {}) {
  if (!restaurantId) return [];
  return readAll()
    .filter((product) => product.restaurantId === restaurantId)
    .filter((product) => includeArchived || !product.archived);
}

export function getProductById(id) {
  if (!id) return null;
  return readAll().find((product) => product.id === id) || null;
}

export function getCategories(products) {
  const list = products || readAll();
  const present = Array.from(new Set(list.map((product) => product.category)));
  present.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return present;
}

// --- Dashboard-ready mutations ---------------------------------------------

// Normalizes arbitrary form input into a complete, persisted product. `id` is
// preserved for edits and generated for new products, so a product always has a
// stable unique identifier.
function buildProduct(input, restaurantId) {
  const category = resolveCategory({
    restaurantId,
    categoryId: input.categoryId,
    name: input.category,
  });

  return hydrateProduct({
    ...input,
    restaurantId,
    category: category ? category.name : input.category,
    categoryId: category ? category.id : null,
  });
}

export function createProduct(input, restaurantId = RESTAURANT_ID) {
  const name = String(input?.name || '').trim();
  if (!name) throw new Error('Product name is required.');
  if (!restaurantId) throw new Error('A restaurant is required.');

  const product = buildProduct(
    {
      ...input,
      id: input?.id || generateProductId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    restaurantId
  );

  writeAll([product, ...readAll()]);
  return product;
}

export function updateProduct(id, patch = {}) {
  const existing = getProductById(id);
  if (!existing) return null;

  const merged = buildProduct(
    {
      ...existing,
      ...patch,
      id,
      restaurantId: existing.restaurantId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    },
    existing.restaurantId
  );

  const next = readAll().map((product) => (product.id === id ? merged : product));
  writeAll(next);
  return merged;
}

export function setAvailability(id, available) {
  return updateProduct(id, { available: Boolean(available) });
}

export function setFeatured(id, featured) {
  return updateProduct(id, { featured: Boolean(featured) });
}

export function setPrice(id, basePrice) {
  return updateProduct(id, { basePrice: round2(basePrice) });
}

// True when a product appears in any historical order. Order lines snapshot the
// product name/price, so history is never at risk — but we still avoid hard
// deleting referenced products to keep the catalog stable for reporting.
export function isProductReferenced(id) {
  if (!id) return false;
  const orders = readCollection(ORDERS_KEY, []);
  return (Array.isArray(orders) ? orders : []).some((order) =>
    (order.items || []).some((item) => item.productId === id)
  );
}

// Deletes a product. Unreferenced products are removed from the catalog;
// products that appear in order history are archived (hidden from the menu,
// `available: false`) so historical orders and reports stay intact.
export function deleteProduct(id) {
  const product = getProductById(id);
  if (!product) return { success: false, error: 'Product not found.' };

  if (isProductReferenced(id)) {
    const archived = updateProduct(id, { archived: true, available: false });
    return { success: true, mode: 'archived', product: archived };
  }

  writeAll(readAll().filter((entry) => entry.id !== id));
  return { success: true, mode: 'deleted' };
}

export function archiveProduct(id) {
  return updateProduct(id, { archived: true, available: false });
}

export function restoreProduct(id) {
  return updateProduct(id, { archived: false, available: true });
}

export function subscribeProducts(listener) {
  return subscribe(COLLECTION, listener);
}

export const PRODUCT_STORAGE_KEY = STORAGE_KEY;

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
