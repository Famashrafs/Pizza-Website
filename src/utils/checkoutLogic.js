import { RESTAURANT_SETTINGS } from '../config/restaurant.js';
import {
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
  getOrderStatusFlow,
} from '../config/orderStatus.js';
import { calculateTotals } from './cartPricing.js';
import { createCartItem } from './cartItem.js';

// Re-exported so existing imports keep working; the source of truth is
// config/orderStatus.js.
export { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, getOrderStatusFlow };

// Step order shown in the progress indicator. "Cart" is rendered as a link
// back to the cart page; these are the steps handled inside /checkout.
export const CHECKOUT_STEPS = [
  { id: 'details', label: 'Details' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'payment', label: 'Payment' },
  { id: 'review', label: 'Review' },
];

export const FULFILLMENT_TYPES = [
  {
    id: 'delivery',
    label: 'Delivery',
    description: 'We bring your order to your door.',
  },
  {
    id: 'pickup',
    label: 'Pickup',
    description: 'Collect your order from our restaurant.',
  },
];

export function getCheckoutTotals(items, { promoCode = '', fulfillmentType = 'delivery' } = {}) {
  return calculateTotals(items, { promoCode, fulfillmentType });
}

export function getEstimatedTime(fulfillmentType, settings = RESTAURANT_SETTINGS) {
  const range =
    fulfillmentType === 'pickup'
      ? settings.pickup.estimatedMinutes
      : settings.delivery.estimatedMinutes;
  return `${range[0]}–${range[1]} min`;
}

// --- Validation helpers (pure, used by the UI and by orderService) ---

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
    errors.fullName = 'Please enter the name for this order.';
  }
  if (!String(customer.email || '').trim()) {
    errors.email = 'Please enter your email address.';
  } else if (!isEmail(customer.email)) {
    errors.email = 'Please enter a valid email address.';
  }
  if (!String(customer.phone || '').trim()) {
    errors.phone = 'Please enter a phone number for order updates.';
  } else if (digitsOnly(customer.phone).length < 7) {
    errors.phone = 'Please enter a valid phone number.';
  }
  return errors;
}

export function validateAddress(address = {}, fulfillmentType = 'delivery') {
  if (fulfillmentType === 'pickup') return {};
  const errors = {};
  if (!String(address.street || '').trim()) {
    errors.street = 'Street address is required for delivery.';
  }
  if (!String(address.city || '').trim()) {
    errors.city = 'City is required for delivery.';
  }
  if (!String(address.phone || '').trim()) {
    errors.phone = 'A contact phone number is required for delivery.';
  } else if (digitsOnly(address.phone).length < 7) {
    errors.phone = 'Please enter a valid phone number.';
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
