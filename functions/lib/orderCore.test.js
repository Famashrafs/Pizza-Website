// Offline unit tests for the Cloud Function's pricing core. These are the
// tests that actually assert the server recomputes EVERY price from the live
// catalog and the authoritative restaurant settings document — a client can
// smuggle anything it wants; the function ignores it.
//
// Run: npm run test:functions   (node --test functions/lib)

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOrder,
  normalizeSettings,
  recalculateItems,
  calculateTotals,
  validateCustomerInfo,
  validateAddress,
  verifyGuestToken,
} = require('./orderCore');
const { RESTAURANT_ID } = require('./restaurantDefaults');

const BASE_SETTINGS = {
  taxRate: 0.08,
  minOrder: 0,
  deliveryFee: 3.99,
  freeDeliveryThreshold: 35,
  deliveryEnabled: true,
  currency: '$',
};

const PRODUCTS = [
  {
    id: 'p1',
    name: 'Margherita',
    restaurantId: RESTAURANT_ID,
    available: true,
    basePrice: 10,
    sizes: [{ label: 'Medium', adjust: 0 }, { label: 'Large', adjust: 3 }],
    crusts: [
      { id: 'thin', label: 'Thin', price: 0 },
      { id: 'stuffed', label: 'Stuffed', price: 2 },
    ],
    toppings: [
      { id: 'mushroom', name: 'Mushroom', price: 1 },
      { id: 'cheese', name: 'Extra Cheese', price: 1.5 },
      { id: 'olive', name: 'Olive', price: 0.5 },
    ],
    maxToppings: 2,
    defaultSize: 'Medium',
    defaultCrust: 'thin',
  },
  {
    id: 'p2',
    name: 'Pepperoni',
    restaurantId: RESTAURANT_ID,
    available: true,
    basePrice: 12,
  },
  {
    id: 'p-offline',
    name: 'Temporarily unavailable',
    restaurantId: RESTAURANT_ID,
    available: false,
    basePrice: 6,
  },
];

const validCustomer = (overrides = {}) => ({
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+15551234567',
  ...overrides,
});

const validAddress = (overrides = {}) => ({
  street: '1 Analytical Ave',
  city: 'London',
  phone: '+15551234567',
  ...overrides,
});

const cartLine = (productId, qty = 1, config = null) => ({
  id: `${productId}__line`,
  productId,
  name: `${productId} name`,
  qty,
  ...(config ? { config } : {}),
});

const BASE_PAYLOAD = {
  uid: 'cust-1',
  isAnonymous: false,
  restaurantId: RESTAURANT_ID,
  restaurantExists: true,
  settings: BASE_SETTINGS,
  products: PRODUCTS,
  cartItems: [cartLine('p1', 2)],
  customer: validCustomer(),
  fulfillmentType: 'delivery',
  address: validAddress(),
  paymentMethod: 'cash',
  promoCode: '',
  idempotencyKey: 'checkout-abc',
};

test('recomputes all money from the live catalog, ignoring client prices', () => {
  const result = buildOrder({
    ...BASE_PAYLOAD,
    // Client tries to smuggle a huge unit price / line total — ignored.
    cartItems: [{ ...cartLine('p1', 2), unitPrice: 999, lineTotal: 9999 }],
  });

  assert.equal(result.success, true);
  const order = result.order;

  assert.equal(order.customerId, 'cust-1');
  assert.equal(order.restaurantId, RESTAURANT_ID);
  assert.equal(order.orderStatus, 'placed');
  assert.deepEqual(
    order.items.map((i) => ({ unitPrice: i.unitPrice, lineTotal: i.lineTotal, qty: i.qty })),
    [{ unitPrice: 10, lineTotal: 20, qty: 2 }]
  );
  assert.equal(order.subtotal, 20);
  assert.equal(order.deliveryFee, 3.99);
  assert.equal(order.tax, 1.6);
  assert.equal(order.total, 25.59);
  assert.equal(order.promoCode, null);
  assert.equal(order.checkoutId, 'checkout-abc');
});

test('prices configured items from the catalog (size + crust + toppings)', () => {
  const result = buildOrder({
    ...BASE_PAYLOAD,
    cartItems: [
      cartLine('p1', 1, {
        sizeLabel: 'Large',
        crustId: 'stuffed',
        toppingIds: ['mushroom', 'cheese'],
      }),
    ],
  });

  assert.equal(result.success, true);
  const line = result.order.items[0];
  // 10 + 3 (Large) + 2 (stuffed) + 1 + 1.5 (toppings) = 17.5
  assert.equal(line.unitPrice, 17.5);
  assert.equal(line.qty, 1);
  assert.equal(line.lineTotal, 17.5);
});

test('rejects unknown, unavailable and invalid configurations per line', () => {
  const unknown = buildOrder({
    ...BASE_PAYLOAD,
    cartItems: [cartLine('nope', 1)],
  });
  assert.equal(unknown.success, false);
  assert.match(unknown.errors.items[0].reason, /no longer on the menu/i);

  const offline = buildOrder({
    ...BASE_PAYLOAD,
    cartItems: [cartLine('p-offline', 1)],
  });
  assert.equal(offline.success, false);
  assert.match(offline.errors.items[0].reason, /unavailable/i);

  const badConfig = buildOrder({
    ...BASE_PAYLOAD,
    cartItems: [
      cartLine('p1', 1, {
        sizeLabel: 'Large',
        crustId: 'stuffed',
        toppingIds: ['mushroom', 'cheese', 'olive'], // 3 > maxToppings (2)
      }),
    ],
  });
  assert.equal(badConfig.success, false);
  assert.equal(badConfig.errors.items[0].reason, 'The selected options are no longer available.');
});

test('resolves promos from the server promo table', () => {
  const percent = buildOrder({ ...BASE_PAYLOAD, promoCode: 'PIZZA10' });
  assert.equal(percent.success, true);
  // subtotal 20 -> 10% = 2 discount, taxable 18, tax 1.44, fee 3.99 => 23.43
  assert.equal(percent.order.discount, 2);
  assert.equal(percent.order.tax, 1.44);
  assert.equal(percent.order.total, 23.43);

  const fixed = buildOrder({ ...BASE_PAYLOAD, promoCode: 'WELCOME5' });
  assert.equal(fixed.success, true);
  assert.equal(fixed.order.discount, 5);
  assert.equal(fixed.order.promoCode, 'WELCOME5');

  const bogus = buildOrder({ ...BASE_PAYLOAD, promoCode: 'TOTALLY-FAKE' });
  assert.equal(bogus.success, true);
  assert.equal(bogus.order.discount, 0);
  assert.equal(bogus.order.promoCode, null);
});

test('uses the AUTHORITATIVE restaurant settings document for tax and fees', () => {
  const result = buildOrder({
    ...BASE_PAYLOAD,
    settings: {
      ...BASE_SETTINGS,
      taxRate: 0.1,
      deliveryFee: 5,
      freeDeliveryThreshold: 50,
    },
  });

  assert.equal(result.success, true);
  const order = result.order;
  // subtotal 20 -> no free delivery, fee 5, tax 2 (10%) => 27
  assert.equal(order.deliveryFee, 5);
  assert.equal(order.tax, 2);
  assert.equal(order.total, 27);
  assert.equal(order.pricing.taxRate, 0.1);
  assert.equal(order.pricing.deliveryFee, 5);
  assert.equal(order.pricing.freeDelivery, false);

  const free = buildOrder({
    ...BASE_PAYLOAD,
    settings: { ...BASE_SETTINGS, freeDeliveryThreshold: 20 },
  });
  assert.equal(free.success, true);
  assert.equal(free.order.deliveryFee, 0);
  assert.equal(free.order.pricing.freeDelivery, true);
});

test('enforces the minimum order from settings', () => {
  const rejected = buildOrder({
    ...BASE_PAYLOAD,
    settings: { ...BASE_SETTINGS, minOrder: 30 },
  });
  assert.equal(rejected.success, false);
  assert.match(rejected.error, /minimum/i);

  const accepted = buildOrder({
    ...BASE_PAYLOAD,
    settings: { ...BASE_SETTINGS, minOrder: 20 },
  });
  assert.equal(accepted.success, true);
});

test('blocks delivery when the restaurant disabled it, and honors pickup fee = 0', () => {
  const deliveryOff = buildOrder({
    ...BASE_PAYLOAD,
    settings: { ...BASE_SETTINGS, deliveryEnabled: false },
  });
  assert.equal(deliveryOff.success, false);
  assert.ok(deliveryOff.errors.fulfillment);

  const pickup = buildOrder({
    ...BASE_PAYLOAD,
    fulfillmentType: 'pickup',
    address: null,
    paymentMethod: 'cash',
  });
  assert.equal(pickup.success, true);
  assert.equal(pickup.order.deliveryFee, 0);
  assert.equal(pickup.order.address, null);
  assert.equal(pickup.order.addressText, null);
});

test('labels the customer type from the auth provider, not the client', () => {
  const registered = buildOrder(BASE_PAYLOAD);
  assert.equal(registered.order.customerType, 'customer');

  const guest = buildOrder({ ...BASE_PAYLOAD, isAnonymous: true });
  assert.equal(guest.order.customerType, 'guest');

  // An attacker claiming "guest"/"customer" over the wire is ignored.
  const spoofed = buildOrder({ ...BASE_PAYLOAD, isAnonymous: true, customerType: 'customer' });
  assert.equal(spoofed.order.customerType, 'guest');
});

test('cash orders are always pending and never paid by the function', () => {
  const result = buildOrder({ ...BASE_PAYLOAD, paymentMethod: 'cash' });
  assert.equal(result.success, true);
  assert.equal(result.order.paymentStatus, 'pending');
  assert.equal(result.order.paymentProvider, 'cash');
});

test('only enabled payment methods are accepted', () => {
  const card = buildOrder({ ...BASE_PAYLOAD, paymentMethod: 'card' });
  assert.equal(card.success, false);
  assert.match(card.errors.payment, /not available/i);

  const missing = buildOrder({ ...BASE_PAYLOAD, paymentMethod: '' });
  assert.equal(missing.success, false);
  assert.match(missing.errors.payment, /choose a payment method/i);
});

test('validates customer and delivery details server-side', () => {
  const badCustomer = buildOrder({ ...BASE_PAYLOAD, customer: {} });
  assert.equal(badCustomer.success, false);
  assert.ok(badCustomer.errors.customer.fullName);
  assert.ok(badCustomer.errors.customer.email);
  assert.ok(badCustomer.errors.customer.phone);

  const noAddress = buildOrder({ ...BASE_PAYLOAD, address: {} });
  assert.equal(noAddress.success, false);
  assert.ok(noAddress.errors.address.street);
  assert.ok(noAddress.errors.address.city);
});

test('rejects a missing restaurant and an empty cart', () => {
  const noRestaurant = buildOrder({ ...BASE_PAYLOAD, restaurantExists: false });
  assert.equal(noRestaurant.success, false);
  assert.ok(noRestaurant.errors.restaurant);

  const emptyCart = buildOrder({ ...BASE_PAYLOAD, cartItems: [] });
  assert.equal(emptyCart.success, false);
  assert.ok(emptyCart.errors.cart);
});

test('keeps the persisted order schema compatible with the client', () => {
  const result = buildOrder(BASE_PAYLOAD);
  const { order } = result;

  assert.ok(/^ORD-[A-Z0-9]{8}$/.test(result.orderId));
  assert.equal(typeof order.createdAt, 'string');
  assert.equal(typeof order.updatedAt, 'string');
  assert.deepEqual(order.customer, validCustomer());
  assert.equal(order.addressText, '1 Analytical Ave, London');
  assert.equal(order.estimatedTime, '35–50 min');
  assert.equal(order.statusHistory.length, 1);
  assert.equal(order.statusHistory[0].status, 'placed');
  assert.equal(order.statusHistory[0].changedBy, 'customer');
  assert.equal(typeof order.statusHistory[0].at, 'string');
  assert.deepEqual(order.pricing, {
    subtotal: 20,
    discount: 0,
    promoCode: null,
    deliveryFee: 3.99,
    freeDelivery: false,
    tax: 1.6,
    taxRate: 0.08,
    fulfillmentType: 'delivery',
  });
});

test('normalizeSettings falls back to static defaults for sparse docs', () => {
  const plan = normalizeSettings({});
  assert.equal(plan.taxRate, 0.08);
  assert.equal(plan.deliveryFee, 3.99);
  assert.equal(plan.freeDeliveryThreshold, 35);
  assert.equal(plan.minOrder, 0);
  assert.equal(plan.deliveryEnabled, true);
  assert.equal(plan.currency, '$');
});

test('recalculateItems + calculateTotals stay in sync for simple items', () => {
  const { items } = recalculateItems([cartLine('p2', 4)], PRODUCTS);
  const totals = calculateTotals(items, { settings: BASE_SETTINGS });
  assert.equal(items[0].unitPrice, 12);
  assert.equal(items[0].lineTotal, 48);
  assert.equal(totals.subtotal, 48);
  // subtotal >= 35 -> free delivery
  assert.equal(totals.deliveryFee, 0);
  assert.equal(totals.freeDelivery, true);
  assert.equal(totals.tax, 3.84); // 48 * 0.08
  assert.equal(totals.total, 51.84);
});

test('validation helpers reject bad input', () => {
  assert.ok(validateCustomerInfo({}).fullName);
  assert.ok(validateCustomerInfo({ fullName: 'X', email: 'not-an-email', phone: '123' }).email);
  assert.ok(validateAddress({}, 'delivery').street);
  assert.deepEqual(validateAddress({}, 'pickup'), {});
});

test('guest orders carry a hashed tracking token and return the raw token once', () => {
  const guest = buildOrder({ ...BASE_PAYLOAD, isAnonymous: true });

  assert.equal(guest.success, true);
  // A high-entropy token is returned to the client exactly once…
  assert.equal(typeof guest.trackingToken, 'string');
  assert.ok(guest.trackingToken.length >= 32);
  // …while the document stores only its SHA-256 hash (64 hex chars).
  assert.match(guest.order.guestTokenHash, /^[0-9a-f]{64}$/);
  // The plaintext token must never be persisted on the order itself.
  assert.equal(guest.order.trackingToken, undefined);
  assert.ok(!JSON.stringify(guest.order).includes(guest.trackingToken));

  // The token verifies against the stored hash; a wrong/absent one does not.
  assert.equal(verifyGuestToken(guest.trackingToken, guest.order.guestTokenHash), true);
  assert.equal(verifyGuestToken(`${guest.trackingToken}x`, guest.order.guestTokenHash), false);
  assert.equal(verifyGuestToken('', guest.order.guestTokenHash), false);
  assert.equal(verifyGuestToken(guest.trackingToken, ''), false);
  assert.equal(verifyGuestToken('anything', 'not-a-hash'), false);
});

test('registered orders get no guest tracking credential', () => {
  const registered = buildOrder({ ...BASE_PAYLOAD, isAnonymous: false });
  assert.equal(registered.success, true);
  assert.equal(registered.trackingToken, undefined);
  assert.equal(registered.order.guestTokenHash, undefined);
});