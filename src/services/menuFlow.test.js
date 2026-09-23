import {
  createCategory,
  getCategoriesForRestaurant,
  deleteCategory,
} from './categoryService';
import {
  createProduct,
  updateProduct,
  setAvailability,
  deleteProduct,
  getProductById,
  getProductsForRestaurant,
  ensureDefaultProducts,
} from './menuService';
import { seedOwnerSetup } from './restaurantService';
import { RESTAURANT_ID } from '../config/restaurant';

// These tests exercise the real menu-management flow the dashboard drives:
// create category -> create product -> edit -> toggle availability -> delete.
// They run against the service layer with the in-memory Firestore mock
// (`src/services/__mocks__/db.js`), so they cover the same async code paths
// the UI uses.

jest.mock('./db');
const db = require('./db');

beforeEach(() => {
  db.__reset();
});

describe('menu management flow', () => {
  it('creates a product and links it to an existing category', async () => {
    const category = await createCategory({
      restaurantId: RESTAURANT_ID,
      name: 'Salads',
    });
    const product = await createProduct(
      { name: 'Caesar Salad', basePrice: 8.5, categoryId: category.id },
      RESTAURANT_ID
    );

    expect(product.categoryId).toBe(category.id);
    expect(product.category).toBe('Salads');
    expect(product.available).toBe(true);
    expect(product.restaurantId).toBe(RESTAURANT_ID);
    const menu = await getProductsForRestaurant(RESTAURANT_ID);
    expect(menu.some((p) => p.id === product.id)).toBe(true);
  });

  it('creates a category on the fly when a new name is typed', async () => {
    const product = await createProduct(
      { name: 'Taco', basePrice: 5, category: 'Mexican' },
      RESTAURANT_ID
    );

    expect(product.category).toBe('Mexican');
    expect(product.categoryId).toBeTruthy();
    const categories = await getCategoriesForRestaurant(RESTAURANT_ID);
    expect(categories.some((c) => c.name === 'Mexican')).toBe(true);
  });

  it('edits a product and toggles its availability', async () => {
    const created = await createProduct(
      { name: 'Soup', basePrice: 4, category: 'Starters' },
      RESTAURANT_ID
    );

    const updated = await updateProduct(created.id, { basePrice: 4.75 });
    expect(updated.basePrice).toBe(4.75);

    const off = await setAvailability(created.id, false);
    expect(off.available).toBe(false);
    expect((await getProductById(created.id)).available).toBe(false);
  });

  it('hard-deletes a product that has never been ordered', async () => {
    const created = await createProduct(
      { name: 'Ghost Item', basePrice: 1, category: 'Starters' },
      RESTAURANT_ID
    );

    const result = await deleteProduct(created.id);
    expect(result.success).toBe(true);
    expect(result.mode).toBe('deleted');
    expect(await getProductById(created.id)).toBeNull();
  });

  it('archives a product that appears in order history', async () => {
    const created = await createProduct(
      { name: 'Ordered Item', basePrice: 3, category: 'Starters' },
      RESTAURANT_ID
    );
    db.__setDocs({
      'orders/ORD-1': {
        id: 'ORD-1',
        restaurantId: RESTAURANT_ID,
        customerId: 'cust-1',
        items: [{ productId: created.id, qty: 1 }],
      },
    });

    const result = await deleteProduct(created.id);
    expect(result.success).toBe(true);
    expect(result.mode).toBe('archived');
    expect((await getProductById(created.id)).archived).toBe(true);
    // Archived products disappear from the menu the customer/dashboard sees.
    const menu = await getProductsForRestaurant(RESTAURANT_ID);
    expect(menu.some((p) => p.id === created.id)).toBe(false);
  });

  it('refuses to delete a category while products still use it', async () => {
    const category = await createCategory({
      restaurantId: RESTAURANT_ID,
      name: 'Bowls',
    });
    await createProduct(
      { name: 'Bowl', basePrice: 9, categoryId: category.id },
      RESTAURANT_ID
    );

    const result = await deleteCategory(category.id, RESTAURANT_ID);
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('deployment catalog initialization', () => {
  it('customer reads are read-only — an empty catalog stays empty with no writes', async () => {
    db.__reset();
    const menu = await getProductsForRestaurant(RESTAURANT_ID);

    expect(menu).toEqual([]);
    // Reading the menu must never trigger a write (permission-denied seeding
    // attempts from a customer read are forbidden).
    expect(Object.keys(db.__getDocs())).toHaveLength(0);
  });

  it('ensureDefaultProducts is explicit, idempotent and scoped to RESTAURANT_ID', async () => {
    db.__reset();
    const first = await ensureDefaultProducts();
    const second = await ensureDefaultProducts();

    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBe(first.length);
    const stored = (await db.getDocs('products')).filter(
      (p) => p.restaurantId === RESTAURANT_ID
    );
    expect(stored.length).toBe(first.length);
    // It never writes into any other restaurant's catalog.
    expect(
      (await db.getDocs('products')).every((p) => p.restaurantId === RESTAURANT_ID)
    ).toBe(true);
  });

  it('ensureDefaultProducts never overwrites or duplicates an existing catalog', async () => {
    db.__reset();
    await db.setDoc('products/prod-custom', {
      id: 'prod-custom',
      name: 'Custom Slice',
      basePrice: 6,
      restaurantId: RESTAURANT_ID,
      sortOrder: 0,
      available: true,
    });

    const seeded = await ensureDefaultProducts();
    expect(seeded).toHaveLength(1);
    expect(seeded[0].id).toBe('prod-custom');
  });

  it('seedOwnerSetup initializes categories and default products for the deployment', async () => {
    db.__reset();
    await seedOwnerSetup(RESTAURANT_ID);

    const products = await db.getDocs('products');
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((p) => p.restaurantId === RESTAURANT_ID)).toBe(true);
    const categories = await db.getDocs(
      `restaurants/${RESTAURANT_ID}/categories`
    );
    expect(categories.length).toBeGreaterThan(0);
  });

  it('tags products with the managing restaurant and isolates tenant reads', async () => {
    db.__reset();
    const a = await createProduct(
      { name: 'A Special', basePrice: 9, category: 'Starters' },
      'rest-a'
    );
    const b = await createProduct(
      { name: 'B Special', basePrice: 8, category: 'Starters' },
      'rest-b'
    );

    expect(a.restaurantId).toBe('rest-a');
    expect(b.restaurantId).toBe('rest-b');
    expect((await getProductsForRestaurant('rest-a')).map((p) => p.id)).toEqual([a.id]);
    expect((await getProductsForRestaurant('rest-b')).map((p) => p.id)).toEqual([b.id]);
    expect(await getProductsForRestaurant(RESTAURANT_ID)).toEqual([]);
  });

  it('falls back to an equality-only read when the ordered query is blocked by a missing index', async () => {
    db.__reset();
    await ensureDefaultProducts();
    const realGetDocs = db.getDocs;
    let orderedCalls = 0;
    db.getDocs = async (collectionPath, queryOptions) => {
      if (
        collectionPath === 'products' &&
        (queryOptions?.orderBy || []).length > 0 &&
        orderedCalls++ === 0
      ) {
        const err = new Error('The query requires an index. Create it or use a different query.');
        err.code = 'failed-precondition';
        throw err;
      }
      return realGetDocs(collectionPath, queryOptions);
    };

    try {
      const menu = await getProductsForRestaurant(RESTAURANT_ID);
      expect(menu.length).toBeGreaterThan(0);
    } finally {
      db.getDocs = realGetDocs;
    }
  });
});