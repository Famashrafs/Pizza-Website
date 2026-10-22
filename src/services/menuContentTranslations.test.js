import {
  createProduct,
  getProductById,
  updateProduct,
} from './menuService';
import {
  createCategory,
  getCategoriesForRestaurant,
  getCategoryById,
  updateCategory,
} from './categoryService';
import { localizedProductName } from '../utils/menuTranslations';
import { RESTAURANT_ID } from '../config/restaurant';

// Phase 4 data flow: owners write per-language content through the service
// layer, the storefront reads it back with English fallbacks, and category
// translations are copied onto products (the public menu cannot read the
// owner-only categories collection).
//
// Runs against the same in-memory Firestore mock as the existing menu flow.

jest.mock('./db');
const db = require('./db');

beforeEach(() => {
  db.__reset();
});

const optionFixture = {
  sizes: [
    { id: 'size-small', label: 'Small', adjust: 0 },
    { id: 'size-large', label: 'Large', adjust: 3 },
  ],
  crusts: [{ id: 'crust-thin', label: 'Thin', price: 0, available: true }],
  toppings: [
    { id: 'topping-cheese', name: 'Extra cheese', price: 1.5, available: true },
  ],
};

describe('product content translations', () => {
  it('persists normalized per-language content and option labels', async () => {
    const product = await createProduct(
      {
        name: 'Chicken Pizza',
        description: 'Grilled chicken',
        basePrice: 10,
        category: 'Pizza',
        ...optionFixture,
        translations: {
          ar: {
            name: ' بيتزا دجاج ',
            description: ' دجاج مشوي ',
            sizes: { 'size-small': 'صغير', 'size-large': 'كبير', unknown: 'x' },
            crusts: { 'crust-thin': 'رقيق' },
            toppings: { 'topping-cheese': 'جبنة إضافية' },
          },
          it: { name: 'Pizza di pollo' },
        },
      },
      RESTAURANT_ID
    );

    expect(product.name).toBe('Chicken Pizza');
    expect(product.translations).toEqual({
      ar: {
        name: 'بيتزا دجاج',
        description: 'دجاج مشوي',
        sizes: { 'size-small': 'صغير', 'size-large': 'كبير', unknown: 'x' },
        crusts: { 'crust-thin': 'رقيق' },
        toppings: { 'topping-cheese': 'جبنة إضافية' },
      },
      it: { name: 'Pizza di pollo' },
    });
    expect(localizedProductName(product, 'ar')).toBe('بيتزا دجاج');

    const stored = db.__getDocs()[`products/${product.id}`];
    expect(stored.name).toBe('Chicken Pizza');
    expect(stored.translations.ar.name).toBe('بيتزا دجاج');
    // Option ids, prices and labels are untouched by localization.
    expect(stored.sizes).toEqual(optionFixture.sizes);
    expect(stored.toppings).toEqual(optionFixture.toppings);
  });

  it('leaves legacy products on the English fallback', async () => {
    db.__setDocs({
      'products/legacy-item': {
        id: 'legacy-item',
        restaurantId: RESTAURANT_ID,
        name: 'Legacy Pizza',
        description: 'Old record',
        category: 'Pizza',
        basePrice: 7,
        available: true,
        sortOrder: 0,
        sizes: optionFixture.sizes,
        crusts: optionFixture.crusts,
        toppings: optionFixture.toppings,
      },
    });

    const product = await getProductById('legacy-item');
    expect(product.translations).toEqual({});
    expect(product.categoryTranslations).toEqual({});
    expect(localizedProductName(product, 'ar')).toBe('Legacy Pizza');
    expect(localizedProductName(product, 'it')).toBe('Legacy Pizza');
  });

  it('merges edits for one language without dropping the others', async () => {
    const product = await createProduct(
      {
        name: 'Soup',
        description: 'Tomato soup',
        basePrice: 4,
        category: 'Starters',
        ...optionFixture,
        translations: {
          ar: { name: 'شوربة', description: 'شوربة طماطم' },
          it: { name: 'Zuppa' },
        },
      },
      RESTAURANT_ID
    );

    const updated = await updateProduct(product.id, {
      translations: {
        ar: { description: 'شوربة طماطم طازجة', toppings: { 'topping-cheese': 'جبنة' } },
      },
    });

    expect(updated.translations).toEqual({
      ar: {
        name: 'شوربة',
        description: 'شوربة طماطم طازجة',
        toppings: { 'topping-cheese': 'جبنة' },
      },
      it: { name: 'Zuppa' },
    });
    expect(updated.name).toBe('Soup');
    expect(updated.basePrice).toBe(4);
  });

  it('keeps translations when a non-translation field is edited', async () => {
    const product = await createProduct(
      {
        name: 'Pasta',
        basePrice: 12,
        category: 'Pasta',
        ...optionFixture,
        translations: { ar: { name: 'معكرونة' } },
      },
      RESTAURANT_ID
    );

    const updated = await updateProduct(product.id, { basePrice: 13.5 });

    expect(updated.basePrice).toBe(13.5);
    expect(updated.translations).toEqual({ ar: { name: 'معكرونة' } });
    expect(localizedProductName(updated, 'ar')).toBe('معكرونة');
  });
});

describe('category content translations', () => {
  it('persists category names per language', async () => {
    const category = await createCategory({
      restaurantId: RESTAURANT_ID,
      name: 'Bowls',
      translations: {
        ar: { name: ' أطباق ' },
        it: { name: 'Ciotole' },
      },
    });

    expect(category.translations).toEqual({
      ar: { name: 'أطباق' },
      it: { name: 'Ciotole' },
    });

    const [stored] = await getCategoriesForRestaurant(RESTAURANT_ID);
    expect(stored.translations).toEqual({
      ar: { name: 'أطباق' },
      it: { name: 'Ciotole' },
    });
  });

  it('leaves legacy categories with an empty translation map', async () => {
    db.__setDocs({
      [`restaurants/${RESTAURANT_ID}/categories/cat-legacy`]: {
        restaurantId: RESTAURANT_ID,
        name: 'Legacy Category',
        sortOrder: 0,
      },
    });

    const category = await getCategoryById('cat-legacy', RESTAURANT_ID);
    expect(category.translations).toEqual({});
  });

  it('copies translations onto products for public storefront reads', async () => {
    const category = await createCategory({
      restaurantId: RESTAURANT_ID,
      name: 'Bowls',
    });
    const linked = await createProduct(
      {
        name: 'Rice Bowl',
        basePrice: 9,
        categoryId: category.id,
        ...optionFixture,
      },
      RESTAURANT_ID
    );
    // Products written before categories were linked only carry the name.
    db.__setDocs({
      'products/legacy-bowl': {
        id: 'legacy-bowl',
        restaurantId: RESTAURANT_ID,
        name: 'Old Bowl',
        basePrice: 7,
        category: 'Bowls',
        available: true,
        sortOrder: -1,
      },
    });

    const updated = await updateCategory(
      category.id,
      { translations: { ar: { name: 'أطباق' } } },
      RESTAURANT_ID
    );
    expect(updated.translations).toEqual({ ar: { name: 'أطباق' } });
    expect((await getProductById(linked.id)).categoryTranslations).toEqual({
      ar: { name: 'أطباق' },
    });
    expect((await getProductById('legacy-bowl')).categoryTranslations).toEqual({
      ar: { name: 'أطباق' },
    });

    // Adding a second language keeps the first one.
    const withItalian = await updateCategory(
      category.id,
      { translations: { it: { name: 'Ciotole' } } },
      RESTAURANT_ID
    );
    expect(withItalian.translations).toEqual({
      ar: { name: 'أطباق' },
      it: { name: 'Ciotole' },
    });
    expect((await getProductById(linked.id)).categoryTranslations).toEqual({
      ar: { name: 'أطباق' },
      it: { name: 'Ciotole' },
    });

    // Clearing every translation removes the denormalized copy so the
    // storefront falls back to the canonical category name.
    await updateCategory(
      category.id,
      { translations: { ar: { name: '' }, it: { name: '' } } },
      RESTAURANT_ID
    );
    expect((await getProductById(linked.id)).categoryTranslations).toEqual({});
    expect((await getProductById('legacy-bowl')).categoryTranslations).toEqual({});
  });

  it('keeps product category translations when a category is renamed', async () => {
    const category = await createCategory({
      restaurantId: RESTAURANT_ID,
      name: 'Bowls',
      translations: { ar: { name: 'أطباق' } },
    });
    const product = await createProduct(
      {
        name: 'Rice Bowl',
        basePrice: 9,
        categoryId: category.id,
        ...optionFixture,
      },
      RESTAURANT_ID
    );

    const renamed = await updateCategory(
      category.id,
      { name: 'Rice Bowls' },
      RESTAURANT_ID
    );

    expect(renamed.name).toBe('Rice Bowls');
    expect(renamed.translations).toEqual({ ar: { name: 'أطباق' } });
    const stored = await getProductById(product.id);
    expect(stored.categoryTranslations).toEqual({ ar: { name: 'أطباق' } });
  });
});
