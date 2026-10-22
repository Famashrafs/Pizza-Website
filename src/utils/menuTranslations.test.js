import {
  contentLocale,
  getCategoryLabels,
  hasOptionTranslation,
  localizedCategoryName,
  localizedOptionLabel,
  localizedProductCategory,
  localizedProductDescription,
  localizedProductName,
  mergeCategoryTranslations,
  mergeTranslations,
  normalizeCategoryTranslations,
  normalizeTranslations,
} from './menuTranslations';
import { searchProducts } from './menuLogic';

// Phase 4 helpers are shared by the owner dashboard (writes) and the public
// storefront (reads). These tests pin the fallback rules: English stays in the
// existing fields, translations are additive, and an empty value always means
// "use the default content".

describe('contentLocale', () => {
  it('reduces a full i18n language tag to its content locale', () => {
    expect(contentLocale('ar-EG')).toBe('ar');
    expect(contentLocale('it')).toBe('it');
    expect(contentLocale(undefined)).toBe('en');
  });
});

describe('normalizeTranslations', () => {
  it('keeps ar/it content and option maps keyed by option id', () => {
    const normalized = normalizeTranslations({
      en: { name: 'Ignored' },
      ar: {
        name: ' بيتزا دجاج ',
        description: ' دجاج مشوي ',
        sizes: { 'size-small': ' صغير ', '': 'no-id', 'size-blank': '  ' },
        toppings: { 'topping-cheese': 'جبنة إضافية' },
      },
      it: 'not-an-object',
    });

    expect(normalized).toEqual({
      ar: {
        name: 'بيتزا دجاج',
        description: 'دجاج مشوي',
        sizes: { 'size-small': 'صغير' },
        toppings: { 'topping-cheese': 'جبنة إضافية' },
      },
    });
  });

  it('drops locales that have no usable content', () => {
    expect(
      normalizeTranslations({
        ar: { name: '   ', description: '', sizes: {} },
        it: { crusts: { 'crust-thin': '' } },
      })
    ).toEqual({});
    expect(normalizeTranslations(null)).toEqual({});
    expect(normalizeTranslations([])).toEqual({});
  });
});

describe('normalizeCategoryTranslations', () => {
  it('keeps only non-empty names', () => {
    expect(
      normalizeCategoryTranslations({
        en: { name: 'Pizza' },
        ar: { name: ' بيتزا ' },
        it: { name: ' ' },
      })
    ).toEqual({ ar: { name: 'بيتزا' } });
    expect(normalizeCategoryTranslations(undefined)).toEqual({});
  });
});

describe('mergeTranslations', () => {
  const existing = {
    ar: { name: 'بيتزا دجاج', description: 'دجاج مشوي' },
    it: { name: 'Pizza di pollo' },
  };

  it('merges one locale without erasing the others', () => {
    const merged = mergeTranslations(existing, {
      ar: { description: 'دجاج حار' },
    });

    expect(merged.ar).toEqual({
      name: 'بيتزا دجاج',
      description: 'دجاج حار',
    });
    expect(merged.it).toEqual({ name: 'Pizza di pollo' });
  });

  it('removes a field when the owner clears it, falling back to English', () => {
    const merged = mergeTranslations(existing, { ar: { name: '' } });

    expect(merged.ar).toEqual({ description: 'دجاج مشوي' });
    expect(mergeTranslations(merged, { ar: { description: '' } })).toEqual({
      it: { name: 'Pizza di pollo' },
    });
  });

  it('merges option labels per id and removes cleared ids', () => {
    const merged = mergeTranslations(
      {
        ar: {
          sizes: { 'size-small': 'صغير', 'size-large': 'كبير' },
          toppings: { 'topping-cheese': 'جبنة' },
        },
      },
      {
        ar: {
          sizes: { 'size-large': 'ضخم', 'size-small': '' },
          toppings: { 'topping-olives': 'زيتون' },
        },
      }
    );

    expect(merged.ar.sizes).toEqual({ 'size-large': 'ضخم' });
    expect(merged.ar.toppings).toEqual({
      'topping-cheese': 'جبنة',
      'topping-olives': 'زيتون',
    });
  });

  it('ignores locales absent from the patch', () => {
    const merged = mergeTranslations(existing, { it: { name: 'Pizza' } });

    expect(merged.ar).toEqual(existing.ar);
    expect(merged.it).toEqual({ name: 'Pizza' });
  });
});

describe('mergeCategoryTranslations', () => {
  it('merges and clears category names per locale', () => {
    const merged = mergeCategoryTranslations(
      { ar: { name: 'بيتزا' }, it: { name: 'Pizza' } },
      { ar: { name: '' }, it: { name: 'Pizze' } }
    );

    expect(merged).toEqual({ it: { name: 'Pizze' } });
    expect(mergeCategoryTranslations(merged, { it: { name: '' } })).toEqual({});
  });
});

describe('storefront display fallbacks', () => {
  const product = {
    name: 'Chicken Pizza',
    description: 'Grilled chicken',
    category: 'Pizza',
    translations: {
      ar: {
        name: 'بيتزا دجاج',
        description: 'دجاج مشوي',
        sizes: { 'size-small': 'صغير' },
        crusts: { 'crust-thin': 'رقيق' },
        toppings: { 'topping-cheese': 'جبنة إضافية' },
      },
    },
    categoryTranslations: { ar: { name: 'بيتزا' } },
  };

  it('uses the active language for product content', () => {
    expect(localizedProductName(product, 'ar')).toBe('بيتزا دجاج');
    expect(localizedProductDescription(product, 'ar')).toBe('دجاج مشوي');
    expect(localizedProductName(product, 'ar-EG')).toBe('بيتزا دجاج');
  });

  it('falls back to the default content for missing languages', () => {
    expect(localizedProductName(product, 'it')).toBe('Chicken Pizza');
    expect(localizedProductDescription(product, 'it')).toBe('Grilled chicken');
    expect(localizedProductName(product, 'en')).toBe('Chicken Pizza');
    expect(localizedProductName({ name: 'No translations' }, 'ar')).toBe(
      'No translations'
    );
  });

  it('localizes the category label without changing the filter value', () => {
    expect(localizedProductCategory(product, 'ar')).toBe('بيتزا');
    expect(localizedProductCategory(product, 'it')).toBe('Pizza');
    expect(product.category).toBe('Pizza');
  });

  it('localizes a category document name', () => {
    expect(
      localizedCategoryName({ name: 'Pizza', translations: { ar: { name: 'بيتزا' } } }, 'ar')
    ).toBe('بيتزا');
    expect(localizedCategoryName({ name: 'Pizza' }, 'ar')).toBe('Pizza');
  });

  it('localizes size/crust labels and topping names by option id', () => {
    expect(
      localizedOptionLabel(product, 'sizes', { id: 'size-small', label: 'Small' }, 'ar')
    ).toBe('صغير');
    expect(
      localizedOptionLabel(product, 'crusts', { id: 'crust-thin', label: 'Thin' }, 'ar')
    ).toBe('رقيق');
    expect(
      localizedOptionLabel(
        product,
        'toppings',
        { id: 'topping-cheese', name: 'Extra cheese' },
        'ar'
      )
    ).toBe('جبنة إضافية');
  });

  it('falls back to the default option label for English or unknown ids', () => {
    expect(
      localizedOptionLabel(product, 'sizes', { id: 'size-small', label: 'Small' }, 'en')
    ).toBe('Small');
    expect(
      localizedOptionLabel(product, 'sizes', { id: 'size-large', label: 'Large' }, 'ar')
    ).toBe('Large');
    expect(localizedOptionLabel(product, 'sizes', null, 'ar')).toBe('');
  });

  it('detects whether an option has any translation at all', () => {
    expect(hasOptionTranslation(product.translations, 'sizes', 'size-small')).toBe(true);
    expect(hasOptionTranslation(product.translations, 'sizes', 'size-large')).toBe(false);
    expect(hasOptionTranslation(product.translations, 'toppings', 'topping-cheese')).toBe(
      true
    );
    expect(hasOptionTranslation(undefined, 'sizes', 'size-small')).toBe(false);
  });
});

describe('getCategoryLabels', () => {
  const products = [
    { category: 'Pizza', categoryTranslations: { ar: { name: 'بيتزا' } } },
    { category: 'Pizza' },
    { category: 'Salads' },
    { category: 'Salads', categoryTranslations: { it: { name: 'Insalate' } } },
    { category: '' },
  ];

  it('returns one display label per category for the active language', () => {
    expect(Object.fromEntries(getCategoryLabels(products, 'ar'))).toEqual({
      Pizza: 'بيتزا',
      Salads: 'Salads',
    });
    expect(Object.fromEntries(getCategoryLabels(products, 'it'))).toEqual({
      Pizza: 'Pizza',
      Salads: 'Insalate',
    });
  });

  it('returns the canonical category values in English', () => {
    expect(Object.fromEntries(getCategoryLabels(products, 'en'))).toEqual({
      Pizza: 'Pizza',
      Salads: 'Salads',
    });
    expect(getCategoryLabels(null, 'ar').size).toBe(0);
  });
});

describe('searchProducts with localized content', () => {
  const products = [
    {
      name: 'Chicken Pizza',
      description: 'Grilled chicken',
      category: 'Pizza',
      translations: { ar: { name: 'بيتزا دجاج', description: 'دجاج مشوي' } },
    },
    {
      name: 'Beef Burger',
      description: 'Beef patty',
      category: 'Burgers',
      translations: { ar: { name: 'برجر لحم' } },
    },
  ];

  it('matches the localized content the customer sees', () => {
    expect(searchProducts(products, 'دجاج', 'ar')).toEqual([products[0]]);
    expect(searchProducts(products, 'برجر', 'ar')).toEqual([products[1]]);
  });

  it('keeps matching the default English content in every language', () => {
    expect(searchProducts(products, 'burger', 'ar')).toEqual([products[1]]);
    expect(searchProducts(products, 'burger')).toEqual([products[1]]);
  });

  it('does not match translations while the default language is active', () => {
    expect(searchProducts(products, 'دجاج', 'en')).toEqual([]);
    expect(searchProducts(products, 'دجاج')).toEqual([]);
  });
});
