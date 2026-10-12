// Centralized cart pricing. Every component reads money from here so the
// pricing rules live in exactly one place. Fees/tax come from restaurant
// settings (config/restaurant.js) rather than being hardcoded in the UI.
import { RESTAURANT_SETTINGS } from '../config/restaurant.js';
import { calculateDeliveryFee } from './delivery.js';

export const DEFAULT_DELIVERY_FEE = RESTAURANT_SETTINGS.delivery.baseFee;
export const FREE_DELIVERY_THRESHOLD =
  RESTAURANT_SETTINGS.delivery.freeDeliveryThreshold;
export const DEFAULT_TAX_RATE = RESTAURANT_SETTINGS.taxRate;

export const PROMO_CODES = {
  PIZZA10: { type: 'percent', value: 10, label: '10% off your order' },
  WELCOME5: { type: 'fixed', value: 5, label: '$5 off your order' },
  FREEDELIVERY: { type: 'free-delivery', value: 0, label: 'Free delivery' },
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Coerces a value to a non-negative finite number, otherwise returns the
// documented fallback. Used so a missing/partial/null settings document can
// never turn a missing fee into "free" or crash the render.
const numOr = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

// Normalizes whatever the caller has for restaurant settings (the loaded
// `restaurants/{id}` document, `null` while loading, a failed load, or a
// partial object) into the exact pricing inputs `calculateTotals` needs.
//
// Every absent field falls back to the documented static config
// (`RESTAURANT_SETTINGS`), which mirrors the server's `normalizeSettings()` in
// functions/lib/orderCore.js — so the on-screen estimate and the authoritative
// server calculation cannot drift. A null/undefined document is valid input
// here (it means "not loaded yet"), NOT an error: the totals are an estimate
// until the backend confirms them.
export function resolvePricingConfig(settings) {
  const doc = settings && typeof settings === 'object' ? settings : {};
  const delivery =
    doc.delivery && typeof doc.delivery === 'object' ? doc.delivery : {};
  return {
    taxRate: numOr(doc.taxRate, DEFAULT_TAX_RATE),
    deliveryFee: numOr(delivery.baseFee, DEFAULT_DELIVERY_FEE),
    freeDeliveryThreshold: numOr(
      delivery.freeDeliveryThreshold,
      FREE_DELIVERY_THRESHOLD
    ),
    deliveryEnabled: doc.deliveryEnabled !== false,
  };
}

// True only when the AUTHORITATIVE settings document carries the shape the
// pricing math needs (a non-negative tax rate and a delivery block with a
// non-negative base fee and free-delivery threshold). Unlike
// `resolvePricingConfig` — which is deliberately forgiving so an estimate can
// render — this is a strict gate: a malformed/partial document must never be
// treated as "ready", or checkout could submit against a silent fallback.
export function hasUsablePricing(settings) {
  if (!settings || typeof settings !== 'object') return false;
  const taxRate = Number(settings.taxRate);
  if (!Number.isFinite(taxRate) || taxRate < 0) return false;
  const delivery = settings.delivery;
  if (!delivery || typeof delivery !== 'object') return false;
  const baseFee = Number(delivery.baseFee);
  const threshold = Number(delivery.freeDeliveryThreshold);
  return (
    Number.isFinite(baseFee) &&
    baseFee >= 0 &&
    Number.isFinite(threshold) &&
    threshold >= 0
  );
}

export function calculateItemTotal(item) {
  const price = Number(item?.price) || 0;
  const qty = Number(item?.qty) || 0;
  return round2(price * qty);
}

export function calculateSubtotal(items = []) {
  return round2(
    (items || []).reduce((sum, item) => sum + calculateItemTotal(item), 0)
  );
}

export function calculateItemCount(items = []) {
  return (items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}

export function resolveDiscount(promoCode, subtotal, promoTable = PROMO_CODES) {
  const code = String(promoCode || '').trim().toUpperCase();
  const entry = code ? promoTable[code] : null;
  if (!entry) {
    return { code: null, amount: 0, freeDelivery: false, label: '' };
  }
  if (entry.type === 'percent') {
    return {
      code,
      amount: round2((subtotal * entry.value) / 100),
      freeDelivery: false,
      label: entry.label,
    };
  }
  if (entry.type === 'fixed') {
    return {
      code,
      amount: round2(Math.min(entry.value, subtotal)),
      freeDelivery: false,
      label: entry.label,
    };
  }
  if (entry.type === 'free-delivery') {
    return { code, amount: 0, freeDelivery: true, label: entry.label };
  }
  return { code: null, amount: 0, freeDelivery: false, label: '' };
}

export function calculateTotals(items = [], options = {}) {
  const {
    fulfillmentType = 'delivery',
    promoCode = '',
    promoTable = PROMO_CODES,
    settings,
    // Explicit per-call overrides win over the settings doc when supplied.
    deliveryFee,
    freeDeliveryThreshold,
    taxRate,
  } = options;

  const config = resolvePricingConfig(settings);
  const resolvedDeliveryFee =
    deliveryFee == null
      ? config.deliveryFee
      : numOr(deliveryFee, config.deliveryFee);
  const resolvedThreshold =
    freeDeliveryThreshold == null
      ? config.freeDeliveryThreshold
      : numOr(freeDeliveryThreshold, config.freeDeliveryThreshold);
  const resolvedTaxRate =
    taxRate == null ? config.taxRate : numOr(taxRate, config.taxRate);

  const safeItems = items || [];
  const subtotal = calculateSubtotal(safeItems);
  const itemCount = calculateItemCount(safeItems);
  const promo = resolveDiscount(promoCode, subtotal, promoTable);
  const discount = Math.min(promo.amount, subtotal);
  const taxable = Math.max(0, round2(subtotal - discount));

  const delivery = calculateDeliveryFee({
    fulfillmentType,
    subtotal,
    freeDeliveryPromo: promo.freeDelivery,
    settings: {
      delivery: {
        baseFee: resolvedDeliveryFee,
        freeDeliveryThreshold: resolvedThreshold,
      },
    },
  });

  const shipping = delivery.fee;
  const qualifiesFreeDelivery = delivery.free;
  const tax = round2(taxable * resolvedTaxRate);
  const total = round2(taxable + shipping + tax);

  return {
    subtotal,
    itemCount,
    discount,
    discountLabel: promo.label,
    promoCode: promo.code,
    freeDelivery: qualifiesFreeDelivery,
    deliveryFee: shipping,
    deliveryReason: delivery.reason,
    fulfillmentType,
    tax,
    taxRate: resolvedTaxRate,
    total,
  };
}
