// Unit tests for the checkout pricing helpers: settings-authoritative totals
// and the price-change revalidation used before an order is placed.

import {
  describeLoadFailure,
  diffCartPrices,
  getCheckoutTotals,
  getPricingReadiness,
  validateAddress,
  validateCustomerInfo,
} from './checkoutLogic';
import { hasUsablePricing } from './cartPricing';
import { RESTAURANT_SETTINGS } from '../config/restaurant';

const item = (id, price, qty = 1) => ({
  id,
  productId: id,
  name: id,
  price,
  unitPrice: price,
  lineTotal: Math.round(price * qty * 100) / 100,
  qty,
});

const SETTINGS = {
  currency: '$',
  taxRate: 0.1,
  minOrder: 0,
  deliveryEnabled: true,
  delivery: { baseFee: 5, freeDeliveryThreshold: 50, estimatedMinutes: [35, 50] },
  pickup: { address: 'x', hours: 'y', estimatedMinutes: [20, 30] },
};

describe('settings-authoritative checkout totals', () => {
  it('uses the live settings for tax and delivery fee', () => {
    const totals = getCheckoutTotals([item('p1', 20, 1)], { settings: SETTINGS });
    expect(totals.subtotal).toBe(20);
    expect(totals.deliveryFee).toBe(5);
    expect(totals.tax).toBeCloseTo(2, 2);
    expect(totals.total).toBeCloseTo(27, 2);
  });

  it('falls back to the static config when no settings are supplied', () => {
    const totals = getCheckoutTotals([item('p1', 20, 1)], {});
    expect(totals.deliveryFee).toBe(RESTAURANT_SETTINGS.delivery.baseFee);
    expect(totals.taxRate).toBe(RESTAURANT_SETTINGS.taxRate);
  });

  it('pickup is always fee-free', () => {
    const totals = getCheckoutTotals([item('p1', 20, 1)], {
      settings: SETTINGS,
      fulfillmentType: 'pickup',
    });
    expect(totals.deliveryFee).toBe(0);
  });
});

// Regression: this previously threw
// "Cannot read properties of null (reading 'delivery')" because CheckoutPage
// initialises `settings` to `null` while the live settings are still loading,
// and a destructuring default only applies to `undefined`, not `null`.
describe('checkout totals are crash-safe without loaded settings', () => {
  it('does not throw when settings are null (still loading)', () => {
    expect(() =>
      getCheckoutTotals([item('p1', 20, 1)], { settings: null })
    ).not.toThrow();
    const totals = getCheckoutTotals([item('p1', 20, 1)], { settings: null });
    expect(totals.deliveryFee).toBe(RESTAURANT_SETTINGS.delivery.baseFee);
    expect(totals.taxRate).toBe(RESTAURANT_SETTINGS.taxRate);
    expect(totals.total).toBeGreaterThan(0);
  });

  it('does not throw when settings are undefined or a failed load (null)', () => {
    expect(() => getCheckoutTotals([item('p1', 20)], {})).not.toThrow();
    expect(() =>
      getCheckoutTotals([item('p1', 20)], { settings: null })
    ).not.toThrow();
  });

  it('fills a partial settings object field-by-field from the static config', () => {
    const totals = getCheckoutTotals([item('p1', 20)], {
      settings: { taxRate: 0.1 }, // no delivery object at all
    });
    expect(totals.taxRate).toBe(0.1);
    expect(totals.deliveryFee).toBe(RESTAURANT_SETTINGS.delivery.baseFee);
  });

  it('handles an empty/absent cart with null settings without throwing', () => {
    const totals = getCheckoutTotals(undefined, { settings: null });
    expect(totals.subtotal).toBe(0);
    expect(totals.total).toBe(0);
    expect(totals.deliveryFee).toBe(0);
  });

  it('preserves an explicit zero fee instead of substituting the default', () => {
    const totals = getCheckoutTotals([item('p1', 20)], {
      settings: { delivery: { baseFee: 0, freeDeliveryThreshold: 100 } },
    });
    expect(totals.deliveryFee).toBe(0);
  });

  it('honours the free-delivery threshold from settings', () => {
    const totals = getCheckoutTotals([item('p1', 60)], { settings: SETTINGS });
    expect(totals.freeDelivery).toBe(true);
    expect(totals.deliveryFee).toBe(0);
  });

  it('pickup with null settings is still fee-free', () => {
    const totals = getCheckoutTotals([item('p1', 20)], {
      settings: null,
      fulfillmentType: 'pickup',
    });
    expect(totals.deliveryFee).toBe(0);
  });
});

describe('price-change revalidation', () => {
  it('reports lines whose live price differs from the cart price', () => {
    const cart = [item('p1', 10, 2), item('p2', 12, 1)];
    const live = [item('p1', 11, 2), item('p2', 12, 1)];
    expect(diffCartPrices(cart, live)).toEqual([
      { id: 'p1', name: 'p1', oldPrice: 10, newPrice: 11 },
    ]);
  });

  it('ignores sub-cent floating point noise and unavailable lines', () => {
    const cart = [item('p1', 10.1, 1), item('gone', 5, 1)];
    const live = [item('p1', 10.1 + 1e-9, 1)];
    expect(diffCartPrices(cart, live)).toEqual([]);
  });
});

// The root cause of the "paused checkout" was that a single catch collapsed two
// independent failures (public catalog read + authenticated settings read) into
// one flag. These tests pin the separated readiness contract.
describe('getPricingReadiness', () => {
  const PRODUCTS = [{ id: 'p1' }];

  it('is not ready while the catalog is still loading', () => {
    const r = getPricingReadiness({
      catalogStatus: 'loading',
      products: [],
      settingsStatus: 'ready',
      settings: { taxRate: 0.1, delivery: { baseFee: 5, freeDeliveryThreshold: 50 } },
      cartCount: 1,
    });
    expect(r.pricingReady).toBe(false);
    expect(r.reason).toBe('catalog-loading');
  });

  it('is not ready when the catalog read failed (distinct reason)', () => {
    const r = getPricingReadiness({
      catalogStatus: 'error',
      products: [],
      settingsStatus: 'ready',
      settings: { taxRate: 0.1, delivery: { baseFee: 5, freeDeliveryThreshold: 50 } },
      cartCount: 1,
    });
    expect(r.pricingReady).toBe(false);
    expect(r.reason).toBe('catalog-error');
  });

  it('is not ready while settings are still loading (distinct reason)', () => {
    const r = getPricingReadiness({
      catalogStatus: 'ready',
      products: PRODUCTS,
      settingsStatus: 'loading',
      settings: null,
      cartCount: 1,
    });
    expect(r.pricingReady).toBe(false);
    expect(r.reason).toBe('settings-loading');
  });

  it('is not ready when the settings read failed (distinct reason)', () => {
    const r = getPricingReadiness({
      catalogStatus: 'ready',
      products: PRODUCTS,
      settingsStatus: 'error',
      settings: null,
      cartCount: 1,
    });
    expect(r.pricingReady).toBe(false);
    expect(r.reason).toBe('settings-error');
  });

  it('is not ready when settings are shaped wrongly for pricing', () => {
    const r = getPricingReadiness({
      catalogStatus: 'ready',
      products: PRODUCTS,
      settingsStatus: 'ready',
      settings: { taxRate: 0.1 }, // no delivery block
      cartCount: 1,
    });
    expect(r.pricingReady).toBe(false);
    expect(r.reason).toBe('settings-invalid');
  });

  it('is not ready when the catalog is empty but the cart has items', () => {
    const r = getPricingReadiness({
      catalogStatus: 'ready',
      products: [],
      settingsStatus: 'ready',
      settings: { taxRate: 0.1, delivery: { baseFee: 5, freeDeliveryThreshold: 50 } },
      cartCount: 2,
    });
    expect(r.pricingReady).toBe(false);
    expect(r.reason).toBe('catalog-empty');
  });

  it('is ready with a valid catalog, usable settings and a non-empty cart', () => {
    const r = getPricingReadiness({
      catalogStatus: 'ready',
      products: PRODUCTS,
      settingsStatus: 'ready',
      settings: { taxRate: 0.1, delivery: { baseFee: 5, freeDeliveryThreshold: 50 } },
      cartCount: 1,
    });
    expect(r).toEqual({
      catalogReady: true,
      settingsReady: true,
      pricingReady: true,
      reason: null,
    });
  });

  it('is ready with an empty catalog only when the cart is also empty', () => {
    const r = getPricingReadiness({
      catalogStatus: 'ready',
      products: [],
      settingsStatus: 'ready',
      settings: { taxRate: 0.1, delivery: { baseFee: 5, freeDeliveryThreshold: 50 } },
      cartCount: 0,
    });
    expect(r.pricingReady).toBe(true);
    expect(r.reason).toBeNull();
  });
});

describe('hasUsablePricing', () => {
  it('accepts a well-formed settings document (including zero fees)', () => {
    expect(
      hasUsablePricing({
        taxRate: 0,
        delivery: { baseFee: 0, freeDeliveryThreshold: 0 },
      })
    ).toBe(true);
  });

  it('rejects null/undefined and partial documents', () => {
    expect(hasUsablePricing(null)).toBe(false);
    expect(hasUsablePricing(undefined)).toBe(false);
    expect(hasUsablePricing({ taxRate: 0.1 })).toBe(false);
    expect(hasUsablePricing({ delivery: { baseFee: 5 } })).toBe(false);
    expect(hasUsablePricing({ taxRate: 'x', delivery: { baseFee: 5, freeDeliveryThreshold: 50 } })).toBe(
      false
    );
  });
});

describe('describeLoadFailure', () => {
  it('captures only the scope, code and message (no cart/PII)', () => {
    const err = new Error('Missing or insufficient permissions.');
    err.code = 'permission-denied';
    expect(describeLoadFailure('settings', err)).toEqual({
      scope: 'settings',
      code: 'permission-denied',
      message: 'Missing or insufficient permissions.',
    });
  });

  it('tolerates non-Error rejections', () => {
    expect(describeLoadFailure('catalog', 'boom')).toEqual({
      scope: 'catalog',
      code: null,
      message: 'boom',
    });
    expect(describeLoadFailure('catalog', undefined)).toEqual({
      scope: 'catalog',
      code: null,
      message: null,
    });
  });
});

describe('checkout field validation', () => {
  it('requires the customer name, email and a usable phone', () => {
    expect(Object.keys(validateCustomerInfo({}))).toEqual(
      expect.arrayContaining(['fullName', 'email', 'phone'])
    );
    expect(validateCustomerInfo({ fullName: 'A', email: 'a@b.co', phone: '1234567' })).toEqual(
      {}
    );
  });

  it('requires street, city and phone only for delivery', () => {
    expect(Object.keys(validateAddress({}, 'delivery'))).toEqual(
      expect.arrayContaining(['street', 'city', 'phone'])
    );
    expect(validateAddress({}, 'pickup')).toEqual({});
  });
});
