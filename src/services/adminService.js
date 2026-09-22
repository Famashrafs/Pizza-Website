// Pure computation helpers for the admin dashboard and analytics. Every
// function takes data arguments and returns a plain object — no I/O, no
// side-effects. This keeps the numbers testable and decoupled from storage.

import { normalizeOrder, ORDER_STATUS } from '../config/orderStatus';

// Revenue counts orders the restaurant has *accepted* — anything beyond the
// initial "placed" state and not cancelled. Pending orders are excluded because
// they have not been confirmed yet; cancelled orders never count.
const REVENUE_EXCLUDED_STATUSES = [ORDER_STATUS.PENDING, ORDER_STATUS.CANCELLED];

export function isRevenueOrder(order) {
  const status = normalizeOrder(order)?.orderStatus || order?.orderStatus;
  return Boolean(status) && !REVENUE_EXCLUDED_STATUSES.includes(status);
}

// --- Date helpers -----------------------------------------------------------

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

// Normalizes an order record for admin display / computation. Idempotent for
// already-normalized orders.
function ensureNormalized(order) {
  if (order?.statusMeta) return order;
  return normalizeOrder(order) || { ...order };
}

function isActiveOrder(order) {
  const s = ensureNormalized(order)?.orderStatus || order.orderStatus;
  return s && s !== ORDER_STATUS.CANCELLED;
}

export const ANALYTICS_RANGES = [
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
  { key: '90d', label: '90 Days', days: 90 },
];

const RANGE_DAYS = Object.fromEntries(ANALYTICS_RANGES.map((r) => [r.key, r.days]));

function rangeToDays(range, fallback = 7) {
  if (typeof range === 'number') return range;
  return RANGE_DAYS[range] || fallback;
}

// --- Dashboard stats --------------------------------------------------------

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
      todayOrders += 1;
      if (isRevenueOrder(order)) {
        todayRevenue += Number(order.total) || 0;
      }
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

// --- Time series ------------------------------------------------------------

function emptyBuckets(dates, keyFn, formatLabel) {
  const buckets = new Map();
  dates.forEach((date, index) => {
    buckets.set(keyFn(date, index), {
      label: formatLabel(date),
      fullDate: date,
      revenue: 0,
      orders: 0,
    });
  });
  return buckets;
}

function addToSeries(orders, buckets, range, today) {
  for (const raw of orders) {
    const order = ensureNormalized(raw);
    if (order.isCancelled) continue;
    const created = toDate(order.createdAt);
    if (!created) continue;

    if (range === 'today') {
      if (!isSameDay(created, today)) continue;
      const bucket = buckets.get(String(created.getHours()));
      if (!bucket) continue;
      bucket.orders += 1;
      if (isRevenueOrder(order)) bucket.revenue += Number(order.total) || 0;
    } else {
      const bucket = buckets.get(localDateKey(created));
      if (!bucket) continue;
      bucket.orders += 1;
      if (isRevenueOrder(order)) bucket.revenue += Number(order.total) || 0;
    }
  }
}

function finalizeSeries(buckets) {
  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    revenue: round2(bucket.revenue),
  }));
}

function buildHourlySeries(orders, today) {
  const hours = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(today);
    d.setHours(i, 0, 0, 0);
    return d;
  });
  const buckets = emptyBuckets(
    hours,
    (date) => String(date.getHours()),
    (date) => `${String(date.getHours()).padStart(2, '0')}:00`
  );
  addToSeries(orders, buckets, 'today', today);
  return finalizeSeries(buckets);
}

function buildDailySeries(orders, days, today) {
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));
  const buckets = emptyBuckets(
    dates,
    (date) => localDateKey(date),
    (date) => `${date.getMonth() + 1}/${date.getDate()}`
  );
  addToSeries(orders, buckets, `${days}d`, today);
  return finalizeSeries(buckets);
}

// Produces { label, fullDate, revenue, orders } points for the chart.
export function computeSalesSeries(orders = [], range = '7d') {
  const today = startOfToday();
  if (range === 'today') return buildHourlySeries(orders, today);
  return buildDailySeries(orders, rangeToDays(range), today);
}

// --- Recent orders ----------------------------------------------------------

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

export function computeActiveOrderCount(orders = []) {
  return orders.filter((o) => isActiveOrder(o)).length;
}

// --- Analytics --------------------------------------------------------------

function withinWindow(order, from, to) {
  const created = toDate(order.createdAt);
  if (!created) return false;
  return created >= from && created <= to;
}

// Best-selling products across the selected window, based on the line items
// snapshotted on each order. Cancelled orders are ignored.
export function computeBestSellers(orders = [], { limit = 5 } = {}) {
  const byProduct = new Map();

  for (const raw of orders) {
    const order = ensureNormalized(raw);
    if (order.isCancelled) continue;
    for (const item of order.items || []) {
      const key = item.productId || item.id || item.name;
      if (!key) continue;
      if (!byProduct.has(key)) {
        byProduct.set(key, {
          productId: item.productId || null,
          name: item.name || 'Item',
          qty: 0,
          revenue: 0,
        });
      }
      const entry = byProduct.get(key);
      const qty = Number(item.qty) || 0;
      entry.qty += qty;
      entry.revenue += Number(item.lineTotal != null ? item.lineTotal : (item.unitPrice || item.price || 0) * qty) || 0;
    }
  }

  return Array.from(byProduct.values())
    .map((entry) => ({ ...entry, revenue: round2(entry.revenue) }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, limit);
}

// Aggregates everything the analytics page needs for a time window.
export function computeAnalytics({ orders = [], products = [], range = '30d' } = {}) {
  const days = rangeToDays(range, 30);
  const today = startOfToday();
  const from = addDays(today, -(days - 1));

  const windowOrders = orders.filter((raw) => withinWindow(ensureNormalized(raw), from, today));

  const delivered = windowOrders.filter(
    (o) => ensureNormalized(o).orderStatus === ORDER_STATUS.DELIVERED
  ).length;
  const cancelled = windowOrders.filter((o) => ensureNormalized(o).isCancelled).length;
  const revenueOrders = windowOrders.filter((o) => isRevenueOrder(o));

  const totalRevenue = round2(
    revenueOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0)
  );
  const totalOrders = windowOrders.length;
  const averageOrderValue = revenueOrders.length
    ? round2(totalRevenue / revenueOrders.length)
    : 0;

  return {
    range,
    days,
    series: buildDailySeries(orders, days, today),
    totalRevenue,
    totalOrders,
    averageOrderValue,
    delivered,
    cancelled,
    activeOrders: computeActiveOrderCount(windowOrders),
    bestSellers: computeBestSellers(windowOrders, { limit: 5 }),
    totalProducts: products.length,
  };
}

const adminService = {
  computeDashboardStats,
  computeSalesSeries,
  getRecentOrders,
  computeActiveOrderCount,
  isRevenueOrder,
  computeBestSellers,
  computeAnalytics,
  ANALYTICS_RANGES,
};

export default adminService;
