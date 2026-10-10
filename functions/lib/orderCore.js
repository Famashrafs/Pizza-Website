// Pure, dependency-free order-building core for the `createOrder` Cloud
// Function. This is the SERVER-SIDE source of truth for order pricing:
//
//   - every unit price is recomputed from the live catalog (base price + size
//     adjustment + crust price + toppings),
//   - totals (tax, delivery fee, discount, promo) are recomputed from the
//     AUTHORITATIVE restaurant settings document,
//   - no client-supplied money field is ever trusted,
//   - the persisted schema matches the client exactly (see src/services/orderService.js).
//
// The module has no Firebase imports: the callable in `index.js` supplies raw
// catalog/settings/identity inputs and the `node --test` suite can exercise the
// whole pricing engine offline. Keep the math in lockstep with the client's
// display formulas (`src/utils/cartItem.js`, `src/utils/cartPricing.js`) so the
// checkout estimate always matches the charged amount.
//
// keep-in-sync: src/utils/cartItem.js, src/utils/cartPricing.js,
//               src/utils/checkoutLogic.js, src/services/paymentService.js,
//               src/services/orderService.js (createOrder)

'use strict';

const crypto = require('crypto');

const { RESTAURANT_SETTINGS } = require('./restaurantDefaults');

const MAX_INSTRUCTIONS = 200;

const ORDER_STATUS = { PENDING: 'placed' };

// Only cash is enabled until a payment provider is wired up. The function never
// fabricates a "paid" status — cash orders settle on delivery/pickup.
const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash on Delivery', provider: 'cash', enabled: true },
  { id: 'card', label: 'Card', provider: null, enabled: false },
  { id: 'online', label: 'Online Payment', provider: null, enabled: false },
];

const PROMO_CODES = {
  PIZZA10: { type: 'percent', value: 10, label: '10% off your order' },
  WELCOME5: { type: 'fixed', value: 5, label: '$5 off your order' },
  FREEDELIVERY: { type: 'free-delivery', value: 0, label: 'Free delivery' },
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const slug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeQty = (qty) => {
  const value = Math.floor(Number(qty));
  return Number.isFinite(value) && value >= 1 ? value : 1;
};

// --- Restaurant settings (authoritative document -> plan) --------------------

function normalizeSettings(raw) {
  const doc = raw && typeof raw === 'object' ? raw : {};
  const num = (key, fallback) => {
    const value = Number(doc[key]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    currency: String(doc.currency || RESTAURANT_SETTINGS.currency || '$').trim() || '$',
    taxRate: num('taxRate', RESTAURANT_SETTINGS.taxRate),
    minOrder: num('minOrder', RESTAURANT_SETTINGS.minOrder),
    deliveryFee: num('deliveryFee', RESTAURANT_SETTINGS.delivery.baseFee),
    freeDeliveryThreshold: num(
      'freeDeliveryThreshold',
      RESTAURANT_SETTINGS.delivery.freeDeliveryThreshold
    ),
    deliveryEnabled: doc.deliveryEnabled !== false,
    deliveryEstimated: RESTAURANT_SETTINGS.delivery.estimatedMinutes,
    pickupEstimated: RESTAURANT_SETTINGS.pickup.estimatedMinutes,
  };
}

// --- Catalog line rebuild (mirrors src/utils/cartItem.js) --------------------

function resolveSize(product, sizeLabel) {
  const sizes = product.sizes || [];
  if (!sizes.length) return null;
  if (sizeLabel) {
    const match = sizes.find((size) => size.label === sizeLabel);
    if (match) return match;
  }
  const fallback = sizes.find((size) => size.label === product.defaultSize);
  return fallback || sizes[0] || null;
}

function resolveCrust(product, crustId) {
  const crusts = product.crusts || [];
  if (!crusts.length) return null;
  const available = crusts.filter((crust) => crust.available !== false);
  if (crustId) {
    const match = available.find((crust) => crust.id === crustId);
    if (match) return match;
  }
  const fallback = available.find((crust) => crust.id === product.defaultCrust);
  return fallback || available[0] || null;
}

function resolveToppings(product, toppingIds = []) {
  const list = product.toppings || [];
  const ids = Array.isArray(toppingIds) ? toppingIds : [];
  return list.filter((topping) => ids.includes(topping.id));
}

function validateConfiguration(product, config) {
  const { size = null, crust = null, toppings = [], qty = 1, instructions = '' } = config || {};
  const errors = [];

  if ((product.sizes || []).length && !size) errors.push('Please select a size.');
  if (
    (product.crusts || []).filter((c) => c.available !== false).length &&
    !crust
  ) {
    errors.push('Please select a crust.');
  }

  const catalog = product.toppings || [];
  const unavailable = toppings.filter((topping) => topping.available === false);
  if (unavailable.length) {
    errors.push(
      `Remove unavailable toppings: ${unavailable.map((t) => t.name).join(', ')}.`
    );
  }
  if (toppings.some((topping) => !catalog.some((entry) => entry.id === topping.id))) {
    errors.push('One or more selected toppings are no longer available.');
  }
  const max = Number(product.maxToppings) || 0;
  if (max > 0 && toppings.length > max) errors.push(`Choose at most ${max} toppings.`);
  if (!Number.isInteger(Number(qty)) || Number(qty) < 1) {
    errors.push('Quantity must be a whole number of at least 1.');
  }
  if (String(instructions).length > MAX_INSTRUCTIONS) {
    errors.push(`Special instructions must be ${MAX_INSTRUCTIONS} characters or fewer.`);
  }
  return { valid: errors.length === 0, errors };
}

function calculateUnitPrice(product, config) {
  const { size = null, crust = null, toppings = [] } = config || {};
  const base = Number(product.basePrice) || 0;
  const sizeAdjust = size ? Number(size.adjust) || 0 : 0;
  const crustPrice = crust ? Number(crust.price) || 0 : 0;
  const toppingsTotal = (toppings || []).reduce(
    (sum, topping) => sum + (Number(topping.price) || 0),
    0
  );
  return round2(base + sizeAdjust + crustPrice + toppingsTotal);
}

function createCartItem(product, config) {
  const size = config.size ?? resolveSize(product, config.sizeLabel);
  const crust = config.crust ?? resolveCrust(product, config.crustId);
  const toppings = (config.toppings
    ? config.toppings
    : resolveToppings(product, config.toppingIds)
  ).slice();
  const qty = normalizeQty(config.qty);
  const instructions = String(config.instructions ?? '')
    .trim()
    .slice(0, MAX_INSTRUCTIONS);

  if (!validateConfiguration(product, { size, crust, toppings, qty, instructions }).valid) {
    return null;
  }

  const unitPrice = calculateUnitPrice(product, { size, crust, toppings });
  const sortedToppings = [...toppings].sort((a, b) => a.id.localeCompare(b.id));

  const configKey = [
    size ? slug(size.label) : 'nosize',
    crust ? slug(crust.id || crust.label) : 'nocrust',
    ...sortedToppings.map((topping) => topping.id),
    instructions ? `note-${slug(instructions)}` : 'nonote',
  ].join('|');

  const optionNames = [];
  if (size) optionNames.push(size.label);
  if (crust) optionNames.push(crust.label);
  const toppingNames = sortedToppings.map((topping) => topping.name);

  return {
    id: `${product.id}__${configKey}`,
    productId: product.id,
    name: `${product.name}${optionNames.length ? ` (${optionNames.join(', ')})` : ''}`,
    price: unitPrice,
    unitPrice,
    image: product.image,
    size: size ? size.label : null,
    crust: crust ? crust.label : null,
    toppings: toppingNames,
    desc: toppingNames.length ? `Toppings: ${toppingNames.join(', ')}` : '',
    instructions,
    lineTotal: round2(unitPrice * qty),
    config: {
      sizeLabel: size ? size.label : null,
      crustId: crust ? crust.id : null,
      toppingIds: sortedToppings.map((topping) => topping.id),
      instructions,
    },
    qty,
  };
}

function createSimpleCartItem(product) {
  const unitPrice = Number(product.basePrice) || 0;
  return {
    id: product.id,
    productId: product.id,
    name: product.name,
    price: unitPrice,
    unitPrice,
    image: product.image,
    size: null,
    crust: null,
    toppings: [],
    desc: '',
    instructions: '',
    lineTotal: unitPrice,
    config: null,
    qty: 1,
  };
}

// Rebuilds cart lines from the LIVE catalog. Unavailable / unknown items are
// reported as issues instead of being priced from the client.
function recalculateItems(cartItems = [], products = []) {
  const byId = new Map((products || []).map((product) => [product.id, product]));
  const items = [];
  const issues = [];

  for (const line of cartItems || []) {
    const product = byId.get(line && line.productId);
    if (!product) {
      issues.push({
        id: line && line.id,
        name: (line && line.name) || 'Item',
        reason: 'This item is no longer on the menu.',
      });
      continue;
    }
    if (product.available === false) {
      issues.push({
        id: line && line.id,
        name: (line && line.name) || product.name,
        reason: 'This item is currently unavailable.',
      });
      continue;
    }

    const qty = Math.max(1, Math.floor(Number(line.qty) || 1));
    const rebuilt = line.config
      ? createCartItem(product, { ...line.config, qty })
      : createSimpleCartItem(product);

    if (!rebuilt) {
      issues.push({
        id: line && line.id,
        name: (line && line.name) || product.name,
        reason: 'The selected options are no longer available.',
      });
      continue;
    }

    items.push({
      ...rebuilt,
      qty,
      unitPrice: rebuilt.unitPrice,
      lineTotal: round2(rebuilt.unitPrice * qty),
    });
  }

  return { items, issues };
}

// --- Totals (mirrors src/utils/cartPricing.js, settings-authoritative) -------

function resolveDiscount(promoCode, subtotal, promoTable = PROMO_CODES) {
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

function calculateTotals(items = [], options = {}) {
  const { promoCode = '', fulfillmentType = 'delivery', settings } = options;
  const plan = normalizeSettings(settings);

  const subtotal = round2(
    (items || []).reduce(
      (sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.qty) || 0),
      0
    )
  );
  const itemCount = (items || []).reduce(
    (sum, item) => sum + (Number(item.qty) || 0),
    0
  );
  const promo = resolveDiscount(promoCode, subtotal);
  const discount = Math.min(promo.amount, subtotal);
  const taxable = Math.max(0, round2(subtotal - discount));

  let shipping = 0;
  let free = false;
  let reason = null;
  if (fulfillmentType === 'pickup') {
    free = true;
    reason = 'pickup';
  } else if (subtotal <= 0) {
    reason = 'empty';
  } else {
    const reached = subtotal >= plan.freeDeliveryThreshold;
    free = promo.freeDelivery || reached;
    shipping = free ? 0 : round2(plan.deliveryFee);
    reason = promo.freeDelivery ? 'promo' : reached ? 'threshold' : 'standard';
  }

  const tax = round2(taxable * plan.taxRate);
  const total = round2(taxable + shipping + tax);

  return {
    subtotal,
    itemCount,
    discount,
    discountLabel: promo.label,
    promoCode: promo.code,
    freeDelivery: free,
    deliveryFee: shipping,
    deliveryReason: reason,
    fulfillmentType,
    tax,
    taxRate: plan.taxRate,
    total,
  };
}

// --- Customer / address / payment validation ---------------------------------

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function digitsOnly(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function validateCustomerInfo(customer = {}) {
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

function validateAddress(address = {}, fulfillmentType = 'delivery') {
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

function formatAddress(address = {}) {
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

function getPaymentMethod(id) {
  return PAYMENT_METHODS.find((method) => method.id === id) || null;
}

// --- Guest tracking credential -----------------------------------------------
//
// Guest orders are tracked with a HIGH-ENTROPY capability, never the order id
// alone (order ids are short and predictable). The createOrder function:
//   - generates a 24-byte random token,
//   - stores ONLY its SHA-256 hash in the order document (never the plaintext,
//     so a leaked document/bucket access cannot be used to track orders), and
//   - returns the raw token to the client exactly once, in the createOrder
//     response. The client persists it locally for confirmation-page recovery.
// The `getGuestOrder` callable later verifies the presented token against the
// stored hash with a timing-safe comparison.

function generateGuestToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function sha256hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// Constant-time comparison of a presented token against a stored hash. Any
// malformed input is rejected without disclosing how the stored value looked.
function verifyGuestToken(token, hash) {
  if (!token || !hash) return false;
  const expected = Buffer.from(String(hash), 'hex');
  const actual = Buffer.from(sha256hex(String(token)), 'hex');
  if (expected.length !== actual.length || expected.length === 0) return false;
  return crypto.timingSafeEqual(expected, actual);
}

// --- Order document assembly -------------------------------------------------

function generateOrderId() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0');
  return `ORD-${stamp}${rand}`;
}

// Builds a validated order. identity: { uid, isAnonymous }. Products/settings
// are the raw Firestore docs so this stays pure and testable. Returns
// { success:false, errors, error } or { success:true, orderId, order, response }
// where `order` is the persisted document shape (ISO timestamps; the caller
// replaces createdAt/updatedAt with server timestamps before writing) and
// `response` is the same shape hydrated for the client (without server writes).
function buildOrder({
  uid,
  isAnonymous = false,
  restaurantId,
  restaurantExists = true,
  products = [],
  settings,
  cartItems = [],
  customer = {},
  fulfillmentType = 'delivery',
  address = null,
  paymentMethod = '',
  customerNotes = '',
  promoCode = '',
  idempotencyKey = null,
} = {}) {
  const errors = {};
  const plan = normalizeSettings(settings);

  if (!(cartItems || []).length) {
    errors.cart = 'Your cart is empty.';
  }
  if (!uid) {
    errors.auth = 'You must be signed in to place an order.';
  }

  const customerErrors = validateCustomerInfo(customer);
  if (Object.keys(customerErrors).length) errors.customer = customerErrors;

  const addressErrors = validateAddress(address || {}, fulfillmentType);
  if (Object.keys(addressErrors).length) errors.address = addressErrors;

  const payment = getPaymentMethod(paymentMethod);
  if (!payment) {
    errors.payment = 'Please choose a payment method.';
  } else if (!payment.enabled) {
    errors.payment = `${payment.label} is not available yet. Please choose another method.`;
  }

  if (!restaurantId) {
    errors.restaurant = 'This store is unavailable right now. Please try again later.';
  } else if (!restaurantExists) {
    errors.restaurant = 'This store is unavailable right now. Please try again later.';
  }

  if (fulfillmentType === 'delivery' && !plan.deliveryEnabled) {
    errors.fulfillment = 'Delivery is currently unavailable. Please choose pickup.';
  }

  const { items, issues } = recalculateItems(cartItems, products);
  if (issues.length) errors.items = issues;

  if (Object.keys(errors).length) {
    return {
      success: false,
      errors,
      error: 'We could not place your order. Please review the highlighted fields.',
    };
  }

  const totals = calculateTotals(items, { promoCode, fulfillmentType, settings });

  if (plan.minOrder > 0 && totals.total < plan.minOrder) {
    return {
      success: false,
      errors: {
        cart: `Orders under the $${plan.minOrder} minimum are not accepted.`,
      },
      error: `Orders under the $${plan.minOrder} minimum are not accepted.`,
    };
  }

  const phone = String(customer.phone || '').trim();
  const normalizedAddress =
    fulfillmentType === 'pickup'
      ? null
      : {
          street: String(address.street || '').trim(),
          area: String(address.area || '').trim(),
          building: String(address.building || '').trim(),
          apartment: String(address.apartment || '').trim(),
          floor: String(address.floor || '').trim(),
          landmark: String(address.landmark || '').trim(),
          city: String(address.city || '').trim(),
          phone: String(address.phone || phone).trim(),
        };

  const nowISO = new Date().toISOString();
  const orderId = generateOrderId();

  // Guest checkout gets a tracking capability: the raw token leaves the server
  // exactly once (below); only its SHA-256 hash is persisted with the order.
  let trackingToken = null;
  if (isAnonymous) {
    trackingToken = generateGuestToken();
  }

  const order = {
    restaurantId,
    customerId: uid,
    // Display/analytics tag only — the anonymous auth provider is the source of
    // truth. Never grants or denies anything by itself.
    customerType: isAnonymous ? 'guest' : 'customer',
    customer: {
      fullName: String(customer.fullName || '').trim(),
      email: String(customer.email || '').trim(),
      phone,
    },
    items,
    subtotal: totals.subtotal,
    deliveryFee: totals.deliveryFee,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total,
    promoCode: totals.promoCode || null,
    pricing: {
      subtotal: totals.subtotal,
      discount: totals.discount,
      promoCode: totals.promoCode,
      deliveryFee: totals.deliveryFee,
      freeDelivery: totals.freeDelivery,
      tax: totals.tax,
      taxRate: totals.taxRate,
      fulfillmentType,
    },
    fulfillmentType,
    address: normalizedAddress,
    addressText: normalizedAddress ? formatAddress(normalizedAddress) : null,
    paymentMethod: payment.id,
    // Server-computed: cash always starts pending and is NEVER set to "paid"
    // by this function — a provider verification would be required.
    paymentStatus: 'pending',
    paymentProvider: payment.provider,
    orderStatus: ORDER_STATUS.PENDING,
    customerNotes: String(customerNotes || '').trim(),
    estimatedTime: getEstimatedTime(fulfillmentType, plan),
    checkoutId: idempotencyKey || null,
    statusHistory: [
      { status: ORDER_STATUS.PENDING, at: nowISO, changedBy: 'customer' },
    ],
    createdAt: nowISO,
    updatedAt: nowISO,
    ...(trackingToken ? { guestTokenHash: sha256hex(trackingToken) } : {}),
  };

  return {
    success: true,
    orderId,
    order,
    ...(trackingToken ? { trackingToken } : {}),
  };
}

function getEstimatedTime(fulfillmentType, plan) {
  const range =
    fulfillmentType === 'pickup' ? plan.pickupEstimated : plan.deliveryEstimated;
  return `${range[0]}–${range[1]} min`;
}

module.exports = {
  buildOrder,
  normalizeSettings,
  recalculateItems,
  calculateTotals,
  validateCustomerInfo,
  validateAddress,
  generateOrderId,
  generateGuestToken,
  sha256hex,
  verifyGuestToken,
  PAYMENT_METHODS,
  PROMO_CODES,
};