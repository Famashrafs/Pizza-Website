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
} from './menuService';
import { RESTAURANT_ID } from '../config/restaurant';

// These tests exercise the real menu-management flow the dashboard drives:
// create category -> create product -> edit -> toggle availability -> delete.
// They run against the same service layer the UI uses (services, not renders).

beforeEach(() => {
  localStorage.clear();
});

describe('menu management flow', () => {
  it('creates a product and links it to an existing category', () => {
    const category = createCategory({ restaurantId: RESTAURANT_ID, name: 'Salads' });
    const product = createProduct(
      { name: 'Caesar Salad', basePrice: 8.5, categoryId: category.id },
      RESTAURANT_ID
    );

    expect(product.categoryId).toBe(category.id);
    expect(product.category).toBe('Salads');
    expect(product.available).toBe(true);
    expect(product.restaurantId).toBe(RESTAURANT_ID);
    expect(getProductsForRestaurant(RESTAURANT_ID).some((p) => p.id === product.id)).toBe(true);
  });

  it('creates a category on the fly when a new name is typed', () => {
    const product = createProduct(
      { name: 'Taco', basePrice: 5, category: 'Mexican' },
      RESTAURANT_ID
    );

    expect(product.category).toBe('Mexican');
    expect(product.categoryId).toBeTruthy();
    expect(
      getCategoriesForRestaurant(RESTAURANT_ID).some((c) => c.name === 'Mexican')
    ).toBe(true);
  });

  it('edits a product and toggles its availability', () => {
    const created = createProduct(
      { name: 'Soup', basePrice: 4, category: 'Starters' },
      RESTAURANT_ID
    );

    const updated = updateProduct(created.id, { basePrice: 4.75 });
    expect(updated.basePrice).toBe(4.75);

    const off = setAvailability(created.id, false);
    expect(off.available).toBe(false);
    expect(getProductById(created.id).available).toBe(false);
  });

  it('hard-deletes a product that has never been ordered', () => {
    const created = createProduct(
      { name: 'Ghost Item', basePrice: 1, category: 'Starters' },
      RESTAURANT_ID
    );

    const result = deleteProduct(created.id);
    expect(result.success).toBe(true);
    expect(result.mode).toBe('deleted');
    expect(getProductById(created.id)).toBeNull();
  });

  it('archives a product that appears in order history', () => {
    const created = createProduct(
      { name: 'Ordered Item', basePrice: 3, category: 'Starters' },
      RESTAURANT_ID
    );
    localStorage.setItem(
      'orders',
      JSON.stringify([
        {
          id: 'ORD-1',
          restaurantId: RESTAURANT_ID,
          items: [{ productId: created.id, qty: 1 }],
        },
      ])
    );

    const result = deleteProduct(created.id);
    expect(result.success).toBe(true);
    expect(result.mode).toBe('archived');
    expect(getProductById(created.id).archived).toBe(true);
    // Archived products disappear from the menu the customer/dashboard sees.
    expect(getProductsForRestaurant(RESTAURANT_ID).some((p) => p.id === created.id)).toBe(false);
  });

  it('refuses to delete a category while products still use it', () => {
    const category = createCategory({ restaurantId: RESTAURANT_ID, name: 'Bowls' });
    createProduct({ name: 'Bowl', basePrice: 9, categoryId: category.id }, RESTAURANT_ID);

    const result = deleteCategory(category.id);
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});
