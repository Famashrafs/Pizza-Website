import { RESTAURANT_SETTINGS } from '../config/restaurant.js';
import {
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
  getOrderStatusFlow,
} from '../config/orderStatus.js';
import { calculateTotals, hasUsablePricing } from './cartPricing.js';
import { createCartItem } from './cartItem.js';

// Re-exported so existing imports keep working; the source of truth is
// config/orderStatus.js.
export { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, getOrderStatusFlow };

// Step order shown in the progress indicator. "Cart" is rendered as a link
// back to the cart page; these are the steps handled inside /checkout.
//
// The ids are part of the flow (they are the step keys the UI switches on and
// they never change); only the display text is a translation key now.
export const CHECKOUT_STEPS = [
  { id: 'details', labelKey: 'checkout.stepDetails' },
  { id: 'delivery', labelKey: 'checkout.stepDelivery' },
  { id: 'payment', labelKey: 'checkout.stepPayment' },
  { id: 'review', labelKey: 'checkout.stepReview' },
];

export const FULFILLMENT_TYPES = [
  {
    id: 'delivery',
    labelKey: 'checkout.fulfillmentDelivery',
    descriptionKey: 'checkout.fulfillmentDeliveryDescription',
  },
  {
    id: 'pickup',
    labelKey: 'checkout.fulfillmentPickup',
    descriptionKey: 'checkout.fulfillmentPickupDescription',
  },
];

// Payment method copy lives in services/paymentService.js (shared with the
// rest of the app), so the UI looks the translated label/description up by
// method id instead of hardcoding it. The English text of the service stays
// the fallback for a method that has no key here yet.
export const PAYMENT_METHOD_LABEL_KEYS = {
  cash: 'checkout.paymentCashLabel',
  card: 'checkout.paymentCardLabel',
  online: 'checkout.paymentOnlineLabel',
};

export const PAYMENT_METHOD_DESCRIPTION_KEYS = {
  cash: 'checkout.paymentCashDescription',
  card: 'checkout.paymentCardDescription',
  online: 'checkout.paymentOnlineDescription',
};

export function getCheckoutTotals(
  items,
  { promoCode = '', fulfillmentType = 'delivery', settings } = {}
) {
  return calculateTotals(items, { promoCode, fulfillmentType, settings });
}

// The single, testable definition of "is checkout allowed to price and submit?".
//
// Catalog and settings are tracked SEPARATELY (loading / ready / error) so a
// failure in one is never mislabelled as the other, and neither is treated as
// ready from a fallback. `reason` names the exact blocker so the UI can show an
// accurate message instead of a catch-all.
//
// An EMPTY catalog is only usable when there is nothing to price. If the cart
// has items and the catalog is empty, those lines cannot be authoritatively
// repriced, so pricing is NOT ready (the menu must not silently count as
// usable just because the request succeeded).
export function getPricingReadiness({
  catalogStatus,
  products,
  settingsStatus,
  settings,
  cartCount = 0,
} = {}) {
  const catalogLoaded = catalogStatus === 'ready';
  const catalogEmpty = !Array.isArray(products) || products.length === 0;
  const catalogReady = catalogLoaded && !(catalogEmpty && cartCount > 0);
  const settingsReady = settingsStatus === 'ready' && hasUsablePricing(settings);

  let reason = null;
  if (catalogStatus === 'error') reason = 'catalog-error';
  else if (catalogStatus !== 'ready') reason = 'catalog-loading';
  else if (catalogEmpty && cartCount > 0) reason = 'catalog-empty';
  else if (settingsStatus === 'error') reason = 'settings-error';
  else if (settingsStatus !== 'ready') reason = 'settings-loading';
  else if (!settingsReady) reason = 'settings-invalid';

  return {
    catalogReady,
    settingsReady,
    pricingReady: catalogReady && settingsReady,
    reason,
  };
}

// Normalizes an unknown rejection into a loggable, PII-free descriptor. Only the
// operation, the error code and the (Firebase-provided) message are captured —
// never cart contents, contact details or tokens.
export function describeLoadFailure(scope, error) {
  const code = (error && error.code) || null;
  const message =
    (error && error.message) || (typeof error === 'string' ? error : null);
  return { scope, code, message };
}

export function getEstimatedTime(fulfillmentType, settings = RESTAURANT_SETTINGS) {
  const range =
    fulfillmentType === 'pickup'
      ? settings.pickup.estimatedMinutes
      : settings.delivery.estimatedMinutes;
  return `${range[0]}–${range[1]} min`;
}

// --- Validation helpers (pure, used by the UI and by orderService) ---
//
// The validators return the FIELD errors only (fullName, email, phone, street,
// city) — those keys never change. The VALUE of an error is a translation key
// now: the message is resolved by the UI (CheckoutPage), which is the only
// place that knows the active language. The trusted server keeps its own copy
// of these validators (functions/lib/orderCore.js) and still answers with
// plain English sentences, so the API contract is untouched.

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function digitsOnly(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

export function createEmptyCustomer(user, profile) {
  return {
    fullName: user?.displayName || '',
    email: user?.email || '',
    phone: profile?.phone || '',
  };
}

export function createEmptyAddress() {
  return {
    street: '',
    building: '',
    apartment: '',
    floor: '',
    landmark: '',
    city: '',
    phone: '',
  };
}

export function validateCustomerInfo(customer = {}) {
  const errors = {};
  if (!String(customer.fullName || '').trim()) {
    errors.fullName = 'checkout.errorFullName';
  }
  if (!String(customer.email || '').trim()) {
    errors.email = 'checkout.errorEmailRequired';
  } else if (!isEmail(customer.email)) {
    errors.email = 'checkout.errorEmailInvalid';
  }
  if (!String(customer.phone || '').trim()) {
    errors.phone = 'checkout.errorPhoneRequired';
  } else if (digitsOnly(customer.phone).length < 7) {
    errors.phone = 'checkout.errorPhoneInvalid';
  }
  return errors;
}

export function validateAddress(address = {}, fulfillmentType = 'delivery') {
  if (fulfillmentType === 'pickup') return {};
  const errors = {};
  if (!String(address.street || '').trim()) {
    errors.street = 'checkout.errorStreetRequired';
  }
  if (!String(address.city || '').trim()) {
    errors.city = 'checkout.errorCityRequired';
  }
  if (!String(address.phone || '').trim()) {
    errors.phone = 'checkout.errorContactPhoneRequired';
  } else if (digitsOnly(address.phone).length < 7) {
    errors.phone = 'checkout.errorPhoneInvalid';
  }
  return errors;
}

export function formatAddress(address = {}) {
  if (!address) return '';
  return [
    address.street,
    address.building ? `Bldg ${address.building}` : '',
    address.apartment ? `Apt ${address.apartment}` : '',
    address.floor ? `Floor ${address.floor}` : '',
    address.city,
    address.landmark ? `Near ${address.landmark}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

// Returns the cart lines whose product/config can no longer be ordered.
export function findUnavailableItems(items = [], products = []) {
  const byId = new Map((products || []).map((product) => [product.id, product]));
  return (items || []).filter((item) => {
    const product = byId.get(item.productId);
    if (!product || product.available === false) return true;
    if (item.config) {
      return createCartItem(product, { ...item.config, qty: item.qty }) === null;
    }
    return false;
  });
}

// Compares the unit prices a shopper added to their cart against the prices of
// the same lines rebuilt from the live catalog. Any difference (a menu price
// was edited) is reported so checkout can warn before the authoritative amount
// is charged. Comparison is in cents to avoid floating-point noise.
export function diffCartPrices(cartItems = [], liveItems = []) {
  const liveById = new Map(
    (liveItems || []).map((item) => [item.id, Number(item.unitPrice) || 0])
  );
  const cents = (value) => Math.round((Number(value) || 0) * 100);
  return (cartItems || []).flatMap((item) => {
    if (!liveById.has(item.id)) return [];
    const oldPrice = Number(item.unitPrice) || 0;
    const newPrice = liveById.get(item.id);
    if (cents(oldPrice) === cents(newPrice)) return [];
    return [{ id: item.id, name: item.name, oldPrice, newPrice }];
  });
}
