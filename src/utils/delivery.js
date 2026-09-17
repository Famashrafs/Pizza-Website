import { RESTAURANT_SETTINGS } from '../config/restaurant.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Centralized delivery-fee calculation. Values come from restaurant settings so
// fees are never hardcoded in the UI. Returns the fee plus enough context for
// the UI to explain *why* a fee was charged or waived.
export function calculateDeliveryFee({
  fulfillmentType = 'delivery',
  subtotal = 0,
  freeDeliveryPromo = false,
  settings = RESTAURANT_SETTINGS,
} = {}) {
  const safeSubtotal = Number(subtotal) || 0;

  if (fulfillmentType === 'pickup') {
    return {
      method: 'pickup',
      fee: 0,
      free: true,
      waived: true,
      baseFee: 0,
      threshold: null,
      reason: 'pickup',
    };
  }

  const { baseFee = 0, freeDeliveryThreshold = Infinity } =
    settings.delivery || {};

  if (safeSubtotal <= 0) {
    return {
      method: 'delivery',
      fee: 0,
      free: false,
      waived: false,
      baseFee,
      threshold: freeDeliveryThreshold,
      reason: 'empty',
    };
  }

  const reachedThreshold = safeSubtotal >= freeDeliveryThreshold;
  const free = freeDeliveryPromo || reachedThreshold;

  return {
    method: 'delivery',
    fee: free ? 0 : round2(baseFee),
    free,
    waived: free,
    baseFee,
    threshold: freeDeliveryThreshold,
    reason: freeDeliveryPromo
      ? 'promo'
      : reachedThreshold
      ? 'threshold'
      : 'standard',
  };
}

export default calculateDeliveryFee;
