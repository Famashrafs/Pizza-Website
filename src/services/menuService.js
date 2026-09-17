import seedProducts, {
  getProductCustomizationDefaults,
} from '../data/seedProducts.js';
import { CATEGORY_ORDER } from '../data/categories.js';
import { RESTAURANT_ID } from '../config/restaurant';

const STORAGE_KEY = 'menu-products-v2';
const LATENCY = 400;

function hydrateProduct(product) {
  const defaults = getProductCustomizationDefaults(product.category);
  return {
    ...product,
    restaurantId: product.restaurantId || RESTAURANT_ID,
    sizes: Array.isArray(product.sizes) ? product.sizes : defaults.sizes,
    toppings: Array.isArray(product.toppings) ? product.toppings : defaults.toppings,
    crusts: Array.isArray(product.crusts) ? product.crusts : defaults.crusts,
    maxToppings:
      product.maxToppings != null ? product.maxToppings : defaults.maxToppings,
    defaultSize:
      product.defaultSize != null ? product.defaultSize : defaults.defaultSize,
    defaultCrust:
      product.defaultCrust != null ? product.defaultCrust : defaults.defaultCrust,
  };
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const hydrated = parsed.map(hydrateProduct);
      if (JSON.stringify(hydrated) !== raw) {
        writeAll(hydrated);
      }
      return hydrated;
    }
  } catch (err) {
    /* fall through to seed */
  }
  const seeded = seedProducts.map((product) => ({ ...product }));
  writeAll(seeded);
  return seeded;
}

function writeAll(products) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch (err) {
    /* storage unavailable — keep in-memory only */
  }
}

const wait = (ms = LATENCY) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchProducts() {
  await wait();
  return readAll();
}

export async function fetchProductById(id) {
  const products = await fetchProducts();
  return products.find((product) => product.id === id) || null;
}

// Restaurant-scoped product list for the admin dashboard.
export function getProductsForRestaurant(restaurantId) {
  if (!restaurantId) return [];
  return readAll().filter((product) => {
    const rid = product.restaurantId || RESTAURANT_ID;
    return rid === restaurantId;
  });
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

// --- Dashboard-ready mutations (persist to the catalog store) ---
export function createProduct(product) {
  const products = readAll();
  const defaults = getProductCustomizationDefaults(product.category);
  const next = [
    {
      restaurantId: RESTAURANT_ID,
      rating: 0,
      available: true,
      featured: false,
      popular: false,
      vegetarian: false,
      ingredients: [],
      popularity: 0,
      createdAt: new Date().toISOString(),
      ...defaults,
      ...product,
    },
    ...products,
  ];
  writeAll(next);
  return next;
}

export function updateProduct(id, patch) {
  const next = readAll().map((product) =>
    product.id === id ? { ...product, ...patch } : product
  );
  writeAll(next);
  return next;
}

export function deleteProduct(id) {
  const next = readAll().filter((product) => product.id !== id);
  writeAll(next);
  return next;
}

export function setAvailability(id, available) {
  return updateProduct(id, { available });
}

export function setPrice(id, basePrice) {
  return updateProduct(id, { basePrice });
}