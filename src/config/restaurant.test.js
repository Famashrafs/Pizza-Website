// Focused tests for the deployment configuration foundation: the static
// defaults, the runtime override precedence, and the guard that prevents a
// missing Firestore pricing document from being treated as a valid checkout.

import { RESTAURANT_ID, RESTAURANT_SETTINGS } from './restaurant';
import {
  PROMO_CODES,
  hasUsablePricing,
  resolvePricingConfig,
} from '../utils/cartPricing';
import {
  getDefaultFulfillmentType,
  getPricingReadiness,
} from '../utils/checkoutLogic';
import { getDefaultPaymentMethod } from '../services/paymentService';

describe('restaurant configuration foundation', () => {
  it('keeps the deployment identity stable', () => {
    expect(RESTAURANT_ID).toBe('restaurant-pizza-demo');
  });

  it('exposes branding, social, locale, theme, fulfillment and payment defaults', () => {
    expect(RESTAURANT_SETTINGS).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        tagline: expect.any(String),
        description: expect.any(String),
        phone: expect.any(String),
        email: expect.any(String),
        social: expect.objectContaining({
          facebook: expect.any(String),
          instagram: expect.any(String),
          x: expect.any(String),
        }),
        locale: expect.objectContaining({
          defaultLanguage: 'en',
          rtlLanguages: ['ar'],
          storageKey: 'pizza-language',
        }),
        theme: expect.objectContaining({
          defaultMode: 'system',
          storageKey: 'pizza-theme',
        }),
        fulfillment: expect.objectContaining({
          defaultType: 'delivery',
          deliveryEnabled: true,
        }),
        payments: expect.objectContaining({ defaultMethod: 'cash' }),
      })
    );
  });

  it('keeps the currently enabled languages unchanged', () => {
    expect(
      RESTAURANT_SETTINGS.locale.supportedLanguages.map(({ code }) => code)
    ).toEqual(['en', 'ar', 'it']);
  });

  it('keeps only cash enabled and no payment provider implementation', () => {
    const methods = RESTAURANT_SETTINGS.payments.methods;
    expect(methods.filter((method) => method.enabled).map(({ id }) => id)).toEqual([
      'cash',
    ]);
    expect(
      methods
        .filter((method) => method.id !== 'cash')
        .every((method) => method.provider === null && method.comingSoon)
    ).toBe(true);
  });

  it('shares the promotion table with cart pricing', () => {
    expect(PROMO_CODES).toBe(RESTAURANT_SETTINGS.promotions.codes);
    expect(Object.keys(PROMO_CODES)).toEqual([
      'PIZZA10',
      'WELCOME5',
      'FREEDELIVERY',
    ]);
  });
});

describe('checkout defaults', () => {
  it('uses the configured fulfillment type when it is supported', () => {
    expect(
      getDefaultFulfillmentType({
        fulfillment: { defaultType: 'pickup', deliveryEnabled: true },
      })
    ).toBe('pickup');
  });

  it('falls back to delivery for a missing or unknown fulfillment type', () => {
    expect(getDefaultFulfillmentType({})).toBe('delivery');
    expect(
      getDefaultFulfillmentType({
        fulfillment: { defaultType: 'drone', deliveryEnabled: true },
      })
    ).toBe('delivery');
  });

  it('does not default to delivery when delivery is disabled', () => {
    expect(
      getDefaultFulfillmentType({
        fulfillment: { defaultType: 'delivery', deliveryEnabled: false },
      })
    ).toBe('pickup');
  });

  it('uses the configured payment method only when cash is enabled', () => {
    expect(getDefaultPaymentMethod(RESTAURANT_SETTINGS)).toBe('cash');
    expect(
      getDefaultPaymentMethod({
        payments: {
          defaultMethod: 'card',
          methods: RESTAURANT_SETTINGS.payments.methods,
        },
      })
    ).toBe('cash');
  });

  it('never selects card/online even when metadata marks it enabled', () => {
    expect(
      getDefaultPaymentMethod({
        payments: {
          defaultMethod: 'card',
          methods: [{ id: 'card', provider: null, enabled: true }],
        },
      })
    ).toBe('cash');
  });
});

describe('pricing precedence', () => {
  it('uses live Firestore-shaped values over static defaults', () => {
    expect(
      resolvePricingConfig({
        taxRate: 0.1,
        deliveryEnabled: false,
        delivery: { baseFee: 5, freeDeliveryThreshold: 50 },
      })
    ).toEqual({
      taxRate: 0.1,
      deliveryFee: 5,
      freeDeliveryThreshold: 50,
      deliveryEnabled: false,
    });
  });

  it('fills only missing fields from the static config', () => {
    const resolved = resolvePricingConfig({
      taxRate: 0.1,
      delivery: { baseFee: 5 },
    });
    expect(resolved.taxRate).toBe(0.1);
    expect(resolved.deliveryFee).toBe(5);
    expect(resolved.freeDeliveryThreshold).toBe(
      RESTAURANT_SETTINGS.delivery.freeDeliveryThreshold
    );
  });

  it('does not treat a missing or partial pricing document as usable', () => {
    expect(hasUsablePricing(null)).toBe(false);
    expect(hasUsablePricing({ taxRate: 0.08 })).toBe(false);
    expect(
      hasUsablePricing({ taxRate: 0.08, delivery: { baseFee: 3.99 } })
    ).toBe(false);
    expect(
      hasUsablePricing({
        taxRate: 0.08,
        delivery: { baseFee: 3.99, freeDeliveryThreshold: 35 },
      })
    ).toBe(true);
  });

  it('blocks checkout when the authoritative settings document is missing', () => {
    expect(
      getPricingReadiness({
        catalogStatus: 'ready',
        products: [{ id: 'p1' }],
        settingsStatus: 'ready',
        settings: null,
        cartCount: 1,
      })
    ).toEqual({
      catalogReady: true,
      settingsReady: false,
      pricingReady: false,
      reason: 'settings-invalid',
    });
  });
});
