// Unit tests for the checkout pricing helpers: settings-authoritative totals
// and the price-change revalidation used before an order is placed.

import {
  diffCartPrices,
  getCheckoutTotals,
  validateAddress,
  validateCustomerInfo,
} from './checkoutLogic';
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
