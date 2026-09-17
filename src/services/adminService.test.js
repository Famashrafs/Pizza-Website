import {
  computeDashboardStats,
  computeSalesSeries,
  getRecentOrders,
} from './adminService';
import { normalizeOrder } from '../config/orderStatus';

// Builds a minimal, realistic order object (as stored by orderService).
function makeOrder(overrides) {
  const base = {
    id: 'ORD-ABC',
    restaurantId: 'restaurant-pizza-demo',
    customerId: 'cust-1',
    customer: { fullName: 'Ada Lovelace', email: 'ada@example.com', phone: '+1555' },
    items: [{ id: 'i1', name: 'Margherita Pizza', productId: 'p1', qty: 1, unitPrice: 10, lineTotal: 10 }],
    subtotal: 10,
    deliveryFee: 3.99,
    discount: 0,
    tax: 1.12,
    total: 15.11,
    orderStatus: 'delivered',
    paymentStatus: 'paid',
    createdAt: '2026-09-17T10:00:00.000Z',
    updatedAt: '2026-09-17T10:00:00.000Z',
  };
  return normalizeOrder({ ...base, ...overrides });
}

describe('adminService – dashboard stats from real orders', () => {
  it('returns zeros for an empty store', () => {
    const stats = computeDashboardStats({ orders: [], products: [] });
    expect(stats).toEqual({
      todayRevenue: 0,
      todayOrders: 0,
      totalCustomers: 0,
      totalProducts: 0,
    });
  });

  it('counts today revenue, today orders and unique customers', () => {
    const today = new Date().toISOString();
    const orders = [
      makeOrder({ id: 'ORD-1', customerId: 'cust-1', total: 15.11, createdAt: today }),
      makeOrder({ id: 'ORD-2', customerId: 'cust-1', total: 8.5, createdAt: today }),
      makeOrder({ id: 'ORD-3', customerId: 'cust-2', total: 20, createdAt: today }),
      makeOrder({ id: 'ORD-4', customerId: 'cust-3', total: 0, createdAt: today, orderStatus: 'cancelled' }),
    ];
    const stats = computeDashboardStats({ orders, products: [{ id: 'p1' }, { id: 'p2' }] });

    expect(stats.todayOrders).toBe(3);
    // cancelled order excluded from today's revenue
    expect(stats.todayRevenue).toBeCloseTo(43.61, 2);
    expect(stats.totalCustomers).toBe(2);
    expect(stats.totalProducts).toBe(2);
  });

  it('does not count old orders in today stats', () => {
    const orders = [
      makeOrder({ id: 'ORD-OLD', customerId: 'cust-1', total: 99, createdAt: '2026-08-01T10:00:00.000Z' }),
    ];
    const stats = computeDashboardStats({ orders, products: [] });
    expect(stats.todayOrders).toBe(0);
    expect(stats.todayRevenue).toBe(0);
  });
});

describe('adminService – sales series', () => {
  it('builds 24 hourly buckets for today', () => {
    const series = computeSalesSeries([makeOrder({})], 'today');
    expect(series).toHaveLength(24);
    expect(series.every((p) => p.revenue >= 0)).toBe(true);
  });

  it('builds 7 daily buckets for 7d and 30 for 30d', () => {
    expect(computeSalesSeries([], '7d')).toHaveLength(7);
    expect(computeSalesSeries([], '30d')).toHaveLength(30);
  });
});

describe('adminService – recent orders', () => {
  it('sorts newest first', () => {
    const orders = [
      makeOrder({ id: 'ORD-1', createdAt: '2026-09-01T10:00:00.000Z' }),
      makeOrder({ id: 'ORD-2', createdAt: '2026-09-05T10:00:00.000Z' }),
    ];
    const recent = getRecentOrders(orders, 5);
    expect(recent.map((o) => o.id)).toEqual(['ORD-2', 'ORD-1']);
  });
});