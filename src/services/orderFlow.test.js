// End-to-end order lifecycle tests at the service layer: creation, access
// isolation, status transitions, cancellation policy, idempotency, live
// subscriptions and timestamp handling. They run against the in-memory
// Firestore mock (`src/services/__mocks__/db.js`) and cover the exact async
// code paths the UI uses.

import {
  createOrder,
  getOrderForUser,
  getUserOrders,
  getRestaurantOrders,
  getRestaurantOrderById,
  updateOrderStatus,
  cancelOrder,
  subscribeOrders,
  subscribeCustomerOrders,
  reorder,
} from './orderService';
import { ORDER_STATUS } from '../config/orderStatus';
import { RESTAURANT_ID } from '../config/restaurant';

jest.mock('./db');
const db = require('./db');

const OTHER_RESTAURANT = 'restaurant-other';

function seedCatalog() {
  db.__setDocs({
    [`restaurants/${RESTAURANT_ID}`]: {
      id: RESTAURANT_ID,
      name: 'Demo Pizza',
      ownerId: 'owner-1',
    },
    [`restaurants/${OTHER_RESTAURANT}`]: {
      id: OTHER_RESTAURANT,
      name: 'Other Pizza',
      ownerId: 'owner-9',
    },
    'products/p1': {
      id: 'p1',
      name: 'Margherita',
      restaurantId: RESTAURANT_ID,
      available: true,
      archived: false,
      basePrice: 10,
      category: 'Pizza',
      categoryId: 'cat-pizza',
      sortOrder: 0,
    },
    'products/p2': {
      id: 'p2',
      name: 'Pepperoni',
      restaurantId: RESTAURANT_ID,
      available: true,
      archived: false,
      basePrice: 12,
      category: 'Pizza',
      categoryId: 'cat-pizza',
      sortOrder: 1,
    },
    'products/p-offline': {
      id: 'p-offline',
      name: 'Temporarily unavailable',
      restaurantId: RESTAURANT_ID,
      available: false,
      archived: false,
      basePrice: 6,
      category: 'Sides',
      categoryId: 'cat-sides',
      sortOrder: 2,
    },
  });
}

function validCustomer(overrides = {}) {
  return {
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+15551234567',
    ...overrides,
  };
}

function validAddress(overrides = {}) {
  return {
    street: '1 Analytical Ave',
    city: 'London',
    phone: '+15551234567',
    ...overrides,
  };
}

function cartLine(productId, qty = 1) {
  return {
    id: `${productId}__line`,
    productId,
    name: `${productId} name`,
    qty,
  };
}

async function placeOrder(overrides = {}) {
  return createOrder({
    customerId: 'cust-1',
    items: [cartLine('p1', 2)],
    customer: validCustomer(),
    fulfillmentType: 'delivery',
    address: validAddress(),
    paymentMethod: 'cash',
    restaurantId: RESTAURANT_ID,
    ...overrides,
  });
}

beforeEach(() => {
  db.__reset();
  seedCatalog();
});

describe('order creation', () => {
  it('creates an order with a valid customer, recalculating ALL money from live data', async () => {
    // Client tries to smuggle a huge unit price / line total — ignored.
    const result = await placeOrder({
      items: [{ ...cartLine('p1', 2), unitPrice: 999, lineTotal: 9999 }],
    });

    expect(result.success).toBe(true);
    const order = result.order;

    expect(order.customerId).toBe('cust-1');
    expect(order.restaurantId).toBe(RESTAURANT_ID);
    expect(order.orderStatus).toBe(ORDER_STATUS.PENDING);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].name).toBe('Margherita');
    expect(order.items[0].unitPrice).toBe(10); // live price, not 999
    expect(order.items[0].lineTotal).toBe(20);
    expect(order.subtotal).toBe(20);
    expect(order.deliveryFee).toBe(3.99);
    expect(order.tax).toBeCloseTo(1.6, 2);
    expect(order.total).toBeCloseTo(25.59, 2);
    expect(order.promoCode).toBeNull();
    expect(order.customerInfo).toEqual({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+15551234567',
    });
    expect(order.deliveryAddress).toEqual(
      expect.objectContaining({ street: '1 Analytical Ave' })
    );
    expect(order.statusHistory[0]).toEqual(
      expect.objectContaining({ status: 'placed', changedBy: 'customer' })
    );
  });

  it('rejects an order without a customer id', async () => {
    const result = await placeOrder({ customerId: null });
    expect(result.success).toBe(false);
    expect(result.errors.auth).toBeTruthy();
    const orderDocs = Object.keys(db.__getDocs()).filter((key) =>
      key.startsWith('orders/')
    );
    expect(orderDocs).toHaveLength(0); // nothing written
  });

  it('rejects an order for a restaurant that does not exist', async () => {
    const result = await placeOrder({ restaurantId: 'restaurant-does-not-exist' });
    expect(result.success).toBe(false);
    expect(result.errors.restaurant).toBeTruthy();
  });

  it('rejects an order for a restaurant whose catalog does not include the item', async () => {
    // The restaurant exists, but p1 belongs to the deployment restaurant, so
    // ordering it against the OTHER restaurant must fail.
    const result = await placeOrder({ restaurantId: OTHER_RESTAURANT });
    expect(result.success).toBe(false);
    expect(result.errors.items).toBeTruthy();
  });

  it('rejects an order containing an unavailable product', async () => {
    const result = await placeOrder({ items: [cartLine('p-offline', 1)] });
    expect(result.success).toBe(false);
    expect(result.errors.items[0].reason).toMatch(/unavailable/i);
  });
});

describe('order access isolation', () => {
  it('lets a customer read only their own orders', async () => {
    const { order } = await placeOrder();
    const mine = await getUserOrders('cust-1');
    expect(mine.map((o) => o.id)).toContain(order.id);
    expect((await getOrderForUser(order.id, 'cust-1')).id).toBe(order.id);
    expect(await getOrderForUser(order.id, 'cust-2')).toBeNull();
  });

  it('scopes admin reads to one restaurant', async () => {
    const { order: mine } = await placeOrder();
    db.__setDocs({
      [`orders/ORD-OTHER`]: {
        id: 'ORD-OTHER',
        restaurantId: OTHER_RESTAURANT,
        customerId: 'cust-9',
        orderStatus: 'placed',
      },
    });

    const own = await getRestaurantOrders(RESTAURANT_ID);
    expect(own.some((o) => o.id === mine.id)).toBe(true);
    expect(own.some((o) => o.id === 'ORD-OTHER')).toBe(false);

    const other = await getRestaurantOrders(OTHER_RESTAURANT);
    expect(other.map((o) => o.id)).toEqual(['ORD-OTHER']);

    expect(await getRestaurantOrderById(mine.id, OTHER_RESTAURANT)).toBeNull();
    expect((await getRestaurantOrderById('ORD-OTHER', OTHER_RESTAURANT)).id).toBe(
      'ORD-OTHER'
    );
  });

  it('returns an empty history for a customer with no orders', async () => {
    expect(await getUserOrders('nobody')).toEqual([]);
  });
});

describe('status transitions', () => {
  it('advances through the valid delivery flow, appending history with authors', async () => {
    const { order } = await placeOrder();
    const one = await updateOrderStatus(order.id, ORDER_STATUS.CONFIRMED, {
      restaurantId: RESTAURANT_ID,
    });
    expect(one.success).toBe(true);
    expect(one.order.orderStatus).toBe('confirmed');
    expect(one.order.statusHistory).toHaveLength(2);

    const two = await updateOrderStatus(order.id, ORDER_STATUS.PREPARING, {
      restaurantId: RESTAURANT_ID,
      changedBy: 'staff-1',
      note: 'Ticket up',
    });
    expect(two.success).toBe(true);
    expect(two.order.statusHistory).toHaveLength(3);
    expect(two.order.statusHistory.map((e) => e.status)).toEqual([
      'placed',
      'confirmed',
      'preparing',
    ]);
    expect(two.order.statusHistory[2].changedBy).toBe('staff-1');
    expect(two.order.statusHistory[2].note).toBe('Ticket up');
    expect(typeof two.order.statusHistory[2].changedAt).toBe('string');
    expect(new Date(two.order.statusHistory[2].at).getTime()).toBeGreaterThan(0);
    expect(typeof two.order.updatedAt).toBe('string');
  });

  it('rejects invalid transitions (delivered -> preparing, cancelled -> confirmed, skipping)', async () => {
    const { order } = await placeOrder();

    // Skip straight to delivered from placed — not allowed.
    const hopped = await updateOrderStatus(order.id, ORDER_STATUS.DELIVERED, {
      restaurantId: RESTAURANT_ID,
    });
    expect(hopped.success).toBe(false);

    // Walk the full delivery flow to delivered.
    for (const status of [
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.PREPARING,
      ORDER_STATUS.OUT_FOR_DELIVERY,
      ORDER_STATUS.DELIVERED,
    ]) {
      const step = await updateOrderStatus(order.id, status, {
        restaurantId: RESTAURANT_ID,
      });
      expect(step.success).toBe(true);
    }

    // Delivered is terminal.
    const back = await updateOrderStatus(order.id, ORDER_STATUS.PREPARING, {
      restaurantId: RESTAURANT_ID,
    });
    expect(back.success).toBe(false);
    const afterDeliveredCancelled = await updateOrderStatus(
      order.id,
      ORDER_STATUS.CANCELLED,
      { restaurantId: RESTAURANT_ID }
    );
    expect(afterDeliveredCancelled.success).toBe(false);
  });

  it('rejects a no-op status update instead of duplicating history', async () => {
    const { order } = await placeOrder();
    const same = await updateOrderStatus(order.id, ORDER_STATUS.PENDING, {
      restaurantId: RESTAURANT_ID,
    });
    expect(same.success).toBe(false);
    const reloaded = await getRestaurantOrderById(order.id, RESTAURANT_ID);
    expect(reloaded.statusHistory).toHaveLength(1);
  });

  it('allows staff cancellation and then freezes the order', async () => {
    const { order } = await placeOrder();
    const cancelled = await updateOrderStatus(order.id, ORDER_STATUS.CANCELLED, {
      restaurantId: RESTAURANT_ID,
      changedBy: 'owner',
    });
    expect(cancelled.success).toBe(true);
    expect(cancelled.order.orderStatus).toBe('cancelled');
    expect(cancelled.order.cancelledBy).toBe('owner');
    expect(cancelled.order.statusHistory.at(-1).changedBy).toBe('owner');

    const revive = await updateOrderStatus(order.id, ORDER_STATUS.CONFIRMED, {
      restaurantId: RESTAURANT_ID,
    });
    expect(revive.success).toBe(false);
  });
});

describe('customer cancellation policy', () => {
  it('lets the customer cancel a cancellable (placed/confirmed) order', async () => {
    const { order } = await placeOrder();
    const result = await cancelOrder(order.id, 'cust-1');
    expect(result.success).toBe(true);
    expect(result.order.orderStatus).toBe('cancelled');
    expect(result.order.cancelledBy).toBe('customer');
    expect(result.order.statusHistory.at(-1).changedBy).toBe('customer');
    expect(typeof result.order.cancelledAt).toBe('string');
  });

  it('blocks cancellation once the order leaves placed/confirmed', async () => {
    // A pickup order reaches `ready`, which is no longer cancellable.
    const pickup = await placeOrder({
      fulfillmentType: 'pickup',
      items: [cartLine('p1', 1)],
    });
    for (const status of [
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.PREPARING,
      ORDER_STATUS.READY,
    ]) {
      const step = await updateOrderStatus(pickup.order.id, status, {
        restaurantId: RESTAURANT_ID,
      });
      expect(step.success).toBe(true);
    }
    const blocked = await cancelOrder(pickup.order.id, 'cust-1');
    expect(blocked.success).toBe(false);
  });

  it('blocks a customer from cancelling someone else’s order', async () => {
    const { order } = await placeOrder();
    expect((await cancelOrder(order.id, 'cust-2')).success).toBe(false);
  });
});

describe('idempotency + reorder', () => {
  it('returns the same order for a repeated submit with the same key', async () => {
    const first = await placeOrder({ idempotencyKey: 'checkout-abc' });
    const second = await placeOrder({ idempotencyKey: 'checkout-abc' });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(second.reuse).toBe(true);
    const stored = db.__getDocs();
    const orderDocs = Object.keys(stored).filter((key) => key.startsWith('orders/'));
    expect(orderDocs).toHaveLength(1);
  });

  it('rebuilds an order for reordering from the live catalog', async () => {
    const { order } = await placeOrder();
    const { items, unavailable } = await reorder(order);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Margherita');
    expect(items[0].unitPrice).toBe(10);
    expect(unavailable).toEqual([]);
  });
});

describe('subscriptions', () => {
  it('fires restaurant and customer listeners on writes and unsubscribes cleanly', async () => {
    const fires = [];
    const unsubRest = subscribeOrders(() => fires.push('rest'), {
      restaurantId: RESTAURANT_ID,
    });
    const unsubCust = subscribeCustomerOrders(() => fires.push('cust'), {
      customerId: 'cust-1',
    });

    await db.setDoc('orders/ORD-A', {
      restaurantId: RESTAURANT_ID,
      customerId: 'cust-1',
      orderStatus: 'placed',
    });
    expect(fires).toEqual(['rest', 'cust']);

    unsubRest();
    unsubCust();
    await db.setDoc('orders/ORD-B', {
      restaurantId: RESTAURANT_ID,
      customerId: 'cust-1',
      orderStatus: 'placed',
    });
    expect(fires).toEqual(['rest', 'cust']);
  });

  it('returns no-op unsubscribes when the scope is missing', async () => {
    const fires = [];
    const unsubRest = subscribeOrders(() => fires.push('rest'));
    const unsubCust = subscribeCustomerOrders(() => fires.push('cust'));
    expect(typeof unsubRest).toBe('function');
    expect(typeof unsubCust).toBe('function');
    await db.setDoc('orders/ORD-C', {
      restaurantId: RESTAURANT_ID,
      customerId: 'cust-1',
      orderStatus: 'placed',
    });
    expect(unsubRest()).toBeUndefined();
    expect(unsubCust()).toBeUndefined();
    expect(fires).toEqual([]);
  });

  it('re-reads a customer’s orders when their collection changes', async () => {
    const seen = [];
    const unsub = subscribeCustomerOrders(() => seen.push('refresh'), {
      customerId: 'cust-1',
    });
    await placeOrder();
    expect(seen).toEqual(['refresh']);
    unsub();
  });
});

describe('timestamp handling', () => {
  it('stores server timestamps and exposes them as ISO strings', async () => {
    const { order } = await placeOrder();

    const stored = Object.values(db.__getDocs()).find(
      (doc) =>
        doc.customerId === 'cust-1' && doc.restaurantId === RESTAURANT_ID
    );
    expect(stored.createdAt).toBeInstanceOf(Date);
    expect(order.createdAt).toBe('2025-01-01T00:00:00.000Z');
    expect(new Date(order.createdAt).getTime()).toBe(
      new Date('2025-01-01T00:00:00.000Z').getTime()
    );
    expect(order.updatedAt).toBe(order.createdAt);
  });

  it('passes legacy ISO-encoded orders through unchanged', async () => {
    db.__setDocs({
      'orders/ORD-LEGACY': {
        id: 'ORD-LEGACY',
        restaurantId: RESTAURANT_ID,
        customerId: 'legacy-user',
        orderStatus: 'completed', // legacy status alias -> delivered
        createdAt: '2024-01-01T12:00:00.000Z',
        updatedAt: '2024-01-01T12:00:00.000Z',
        statusHistory: [
          { status: 'placed', at: '2024-01-01T12:00:00.000Z' },
        ],
        items: [],
      },
    });
    const orders = await getUserOrders('legacy-user');
    expect(orders).toHaveLength(1);
    expect(orders[0].createdAt).toBe('2024-01-01T12:00:00.000Z');
    expect(orders[0].orderStatus).toBe('delivered'); // normalized
    expect(orders[0].statusHistory[0].at).toBe('2024-01-01T12:00:00.000Z');
  });
});