// Payment architecture. No provider is wired up yet, so card/online payments
// are surfaced as "Coming soon" while the intent API stays ready for Stripe /
// PayPal / etc. We never fake a successful payment.

export const PAYMENT_METHODS = [
  {
    id: 'cash',
    label: 'Cash on Delivery',
    description: 'Pay in cash when your order is delivered or collected.',
    provider: 'cash',
    enabled: true,
    comingSoon: false,
  },
  {
    id: 'card',
    label: 'Card',
    description: 'Pay securely with a credit or debit card.',
    provider: null,
    enabled: false,
    comingSoon: true,
  },
  {
    id: 'online',
    label: 'Online Payment',
    description: 'Pay with Stripe, PayPal and more.',
    provider: null,
    enabled: false,
    comingSoon: true,
  },
];

export function getPaymentMethods() {
  return PAYMENT_METHODS.map((method) => ({ ...method }));
}

export function getPaymentMethod(id) {
  return PAYMENT_METHODS.find((method) => method.id === id) || null;
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
