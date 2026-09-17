// Pure computation helpers for the admin dashboard. Every function takes data
// arguments and returns a plain object — no I/O, no side-effects. This makes
// the dashboard stats testable and decoupled from storage format.

import {
  normalizeOrder,
  ORDER_STATUS,
} from '../config/orderStatus';

// --- Helpers ---------------------------------------------------------------

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Local (not UTC) calendar-date key so buckets don't shift across timezones.
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDate(isoOrStr) {
  if (!isoOrStr) return null;
  const d = new Date(isoOrStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

// Normalizes an order record for admin display / computation. Accepts already-
// normalized orders too (idempotent for the fields we read).
function ensureNormalized(order) {
  if (order?.statusMeta) return order;
  return normalizeOrder(order) || { ...order };
}

// Exclude cancelled orders from revenue and active-order counts.
function isActiveOrder(order) {
  const s = normalizeOrder(order)?.orderStatus || order.orderStatus;
  return s && s !== ORDER_STATUS.CANCELLED;
}

// --- Dashboard stats -------------------------------------------------------

export function computeDashboardStats({ orders = [], products = [] }) {
  const today = startOfToday();
  let todayRevenue = 0;
  let todayOrders = 0;
  const customerIds = new Set();

  for (const raw of orders) {
    const order = ensureNormalized(raw);
    if (order.isCancelled) continue;

    const created = toDate(order.createdAt);
    if (created && isSameDay(created, today)) {
      todayRevenue += Number(order.total) || 0;
      todayOrders += 1;
    }

    if (order.customerId) customerIds.add(order.customerId);
  }

  return {
    todayRevenue: round2(todayRevenue),
    todayOrders,
    totalCustomers: customerIds.size,
    totalProducts: products.length,
  };
}

// --- Sales series ----------------------------------------------------------

// Produces an array of { label, fullDate, revenue } for the chart.
export function computeSalesSeries(orders = [], range = '7d') {
  const today = startOfToday();
  let dates;

  if (range === 'today') {
    // 24 hourly buckets for today
    dates = Array.from({ length: 24 }, (_, i) => {
      const d = new Date(today);
      d.setHours(i, 0, 0, 0);
      return d;
    });
  } else if (range === '30d') {
    dates = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  } else {
    // 7d (default)
    dates = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  }

  const buckets = new Map();
  if (range === 'today') {
    // 24 hourly buckets, keyed by the local hour so the chart always has a
    // full day shape.
    for (let hour = 0; hour < 24; hour += 1) {
      const d = new Date(today);
      d.setHours(hour, 0, 0, 0);
      buckets.set(String(hour), { label: formatLabel(d, range), fullDate: d, revenue: 0 });
    }
  } else {
    for (const d of dates) {
      buckets.set(localDateKey(d), { label: formatLabel(d, range), fullDate: d, revenue: 0 });
    }
  }

  for (const raw of orders) {
    const order = ensureNormalized(raw);
    if (order.isCancelled) continue;
    const created = toDate(order.createdAt);
    if (!created) continue;

    if (range === 'today') {
      if (!isSameDay(created, today)) continue;
      const bucket = buckets.get(String(created.getHours()));
      if (bucket) bucket.revenue += Number(order.total) || 0;
    } else {
      const bucket = buckets.get(localDateKey(created));
      if (bucket) bucket.revenue += Number(order.total) || 0;
    }
  }

  return Array.from(buckets.values()).map((b) => ({
    ...b,
    revenue: round2(b.revenue),
    label: b.label,
  }));
}

function formatLabel(date, range) {
  if (range === 'today') {
    return `${String(date.getHours()).padStart(2, '0')}:00`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// --- Recent orders ---------------------------------------------------------

export function getRecentOrders(orders = [], limit = 5) {
  return [...orders]
    .sort((a, b) => {
      const da = new Date(a.createdAt || 0).getTime();
      const db = new Date(b.createdAt || 0).getTime();
      return db - da;
    })
    .slice(0, limit)
    .map(ensureNormalized);
}

// --- Revenue series for "active orders" label (total non-cancelled count) ---

export function computeActiveOrderCount(orders = []) {
  return orders.filter((o) => isActiveOrder(o)).length;
}

const adminService = {
  computeDashboardStats,
  computeSalesSeries,
  getRecentOrders,
  computeActiveOrderCount,
};

export default adminService;