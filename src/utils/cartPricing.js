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
    deliveryFee = DEFAULT_DELIVERY_FEE,
    freeDeliveryThreshold = FREE_DELIVERY_THRESHOLD,
    taxRate = DEFAULT_TAX_RATE,
    promoCode = '',
    promoTable = PROMO_CODES,
    settings = RESTAURANT_SETTINGS,
  } = options;

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
      ...settings,
      delivery: { baseFee: deliveryFee, freeDeliveryThreshold },
    },
  });

  const shipping = delivery.fee;
  const qualifiesFreeDelivery = delivery.free;
  const tax = round2(taxable * taxRate);
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
    taxRate,
    total,
  };
}
