// Guest tracking flow at the service layer. Guest checkout is authorized by a
// high-entropy token the createOrder response delivers exactly once; the order
// document stores only its SHA-256 hash. These tests prove:
//   - a guest order returns a token and persists only the hash,
//   - getGuestOrder returns the order for the correct token,
//   - a wrong/absent token, or an order id alone, is denied,
//   - registered orders have no guest credential at all,
//   - the device-local last-order reference round-trips for refresh recovery.

import { createOrder, getGuestOrder, getOrderForUser } from './orderService';
import {
  getLastOrder,
  saveLastOrder,
  clearLastOrder,
} from './storage';
import { RESTAURANT_ID } from '../config/restaurant';

jest.mock('./db');
jest.mock('./orderGateway');
const db = require('./db');

function seedCatalog() {
  db.__setDocs({
    [`restaurants/${RESTAURANT_ID}`]: {
      id: RESTAURANT_ID,
      name: 'Demo Pizza',
      taxRate: 0.08,
      deliveryFee: 3.99,
      freeDeliveryThreshold: 35,
      deliveryEnabled: true,
    },
    'products/p1': {
      id: 'p1',
      name: 'Margherita',
      restaurantId: RESTAURANT_ID,
      available: true,
      basePrice: 10,
      category: 'Pizza',
      sortOrder: 0,
    },
  });
}

const validCustomer = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+15551234567',
};

const validAddress = {
  street: '1 Analytical Ave',
  city: 'London',
  phone: '+15551234567',
};

function guestPayload(overrides = {}) {
  return {
    customerId: 'anon-guest-1',
    customerType: 'guest',
    items: [{ id: 'p1__line', productId: 'p1', name: 'Margherita', qty: 1 }],
    customer: validCustomer,
    fulfillmentType: 'delivery',
    address: validAddress,
    paymentMethod: 'cash',
    restaurantId: RESTAURANT_ID,
    idempotencyKey: 'co-guest-test',
    ...overrides,
  };
}

beforeEach(() => {
  db.__reset();
  localStorage.clear();
  seedCatalog();
});

describe('guest order tracking credential', () => {
  it('returns a tracking token but persists only its hash (never the secret)', async () => {
    const result = await createOrder(guestPayload());

    expect(result.success).toBe(true);
    expect(typeof result.trackingToken).toBe('string');
    expect(result.trackingToken.length).toBeGreaterThan(30);

    // The stored document carries the hash, not the plaintext token.
    const stored = db.__getDocs()[`orders/${result.order.id}`];
    expect(stored).toBeTruthy();
    expect(stored.guestTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(result.trackingToken);
    // The response order does not leak the hash either.
    expect(result.order.guestTokenHash).toBeUndefined();
  });

  it('looks up the order with the matching token', async () => {
    const { order, trackingToken } = await createOrder(guestPayload());

    const fetched = await getGuestOrder(order.id, trackingToken);
    expect(fetched).toBeTruthy();
    expect(fetched.id).toBe(order.id);
    expect(fetched.customerId).toBe('anon-guest-1');
    expect(fetched.total).toBeCloseTo(order.total, 2);
  });

  it('denies a wrong token, a missing token, or the order id alone', async () => {
    const { order, trackingToken } = await createOrder(guestPayload());

    expect(await getGuestOrder(order.id, `${trackingToken}tampered`)).toBeNull();
    expect(await getGuestOrder(order.id, '')).toBeNull();
    expect(await getGuestOrder(order.id, null)).toBeNull();
    expect(await getGuestOrder('', trackingToken)).toBeNull();
    expect(await getGuestOrder('ORD-UNKNOWN', trackingToken)).toBeNull();
  });

  it('does not hand a registered order to the guest lookup path', async () => {
    const result = await createOrder(
      guestPayload({
        customerId: 'cust-1',
        customerType: 'customer',
        idempotencyKey: 'co-registered-test',
      })
    );
    expect(result.success).toBe(true);
    expect(result.trackingToken).toBeUndefined();
    // Registered orders have no guestTokenHash, so even a guessed token fails.
    expect(await getGuestOrder(result.order.id, 'anything-at-all')).toBeNull();
    // The owner can still read it through the normal account path.
    const owned = await getOrderForUser(result.order.id, 'cust-1');
    expect(owned?.id).toBe(result.order.id);
  });
});

describe('device-local last-order reference (refresh recovery)', () => {
  it('round-trips an order reference and token, and clears cleanly', () => {
    saveLastOrder({ orderId: 'ORD-ABC123', token: 'secret-token', uid: 'anon-1' });
    const saved = getLastOrder();
    expect(saved).toEqual(
      expect.objectContaining({ orderId: 'ORD-ABC123', token: 'secret-token', uid: 'anon-1' })
    );
    expect(typeof saved.placedAt).toBe('string');

    clearLastOrder();
    expect(getLastOrder()).toBeNull();
  });

  it('ignores records without an order id', () => {
    saveLastOrder({ token: 'orphan-token' });
    expect(getLastOrder()).toBeNull();
  });
});
