// Payment architecture. No provider is wired up yet, so card/online payments
// are surfaced as "Coming soon" while the intent API stays ready for Stripe /
// PayPal / etc. We never fake a successful payment.
//
// The method list (enabled flags and UI metadata) is deployment configuration
// in config/restaurant.js. The trusted server keeps its own enabled-method
// validation in functions/lib/orderCore.js.

import { RESTAURANT_SETTINGS } from '../config/restaurant';

export const PAYMENT_METHODS = RESTAURANT_SETTINGS.payments.methods.map(
  (method) => ({ ...method })
);

export function getPaymentMethods() {
  return PAYMENT_METHODS.map((method) => ({ ...method }));
}

export function getPaymentMethod(id) {
  return PAYMENT_METHODS.find((method) => method.id === id) || null;
}

// The checkout may start on a configured default only when it is an enabled
// method the existing backend can actually settle. Cash is the only supported
// provider today, so an enabled card/online entry never becomes the default.
export function getDefaultPaymentMethod(settings = RESTAURANT_SETTINGS) {
  const methods = Array.isArray(settings?.payments?.methods)
    ? settings.payments.methods
    : PAYMENT_METHODS;
  const requested = settings?.payments?.defaultMethod;
  const method = methods.find((entry) => entry.id === requested);
  if (method?.enabled && method.provider === 'cash') return requested;
  return 'cash';
}

export function isPaymentProviderConfigured() {
  return PAYMENT_METHODS.some(
    (method) => method.enabled && method.provider && method.provider !== 'cash'
  );
}

export function getInitialPaymentStatus(methodId) {
  const method = getPaymentMethod(methodId);
  if (!method) return 'unknown';
  // Cash is settled on delivery/pickup, so it starts as pending — never "paid".
  if (method.provider === 'cash') return 'pending';
  return 'pending';
}

// Provider-agnostic payment intent. Today only cash resolves; card/online throw
// until a provider is configured. When Stripe/PayPal is added, return the
// clientSecret / redirectUrl from here and nothing else needs to change.
export function createPaymentIntent({ method, order = null }) {
  const entry = getPaymentMethod(method);
  if (!entry) {
    throw new Error('Unknown payment method.');
  }
  if (!entry.enabled) {
    throw new Error(`${entry.label} is not available yet.`);
  }
  if (entry.provider === 'cash') {
    return { provider: 'cash', status: 'pending', clientSecret: null, redirectUrl: null };
  }
  if (!isPaymentProviderConfigured()) {
    throw new Error('No payment provider is configured.');
  }
  return {
    provider: entry.provider,
    status: 'requires_confirmation',
    clientSecret: null,
    redirectUrl: null,
    orderId: order?.id || null,
  };
}
