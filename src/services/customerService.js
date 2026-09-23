// Customer service — derived from order history.
//
// Customers are not stored in their own collection yet; the restaurant's
// customer base is computed from the orders placed with that restaurant. This
// keeps a single source of truth (orders) and guarantees a customer can only be
// seen alongside activity the restaurant already owns. When a dedicated
// `customers` collection is added, only this module needs to change.

import { getRestaurantOrders, subscribeOrders } from './orderService';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => String(value || '').replace(/[^\d+]/g, '');

// Stable, URL-safe identity for a customer across orders.
export function getCustomerKey(order) {
  if (order?.customerId) return order.customerId;
  const email = normalizeEmail(order?.customer?.email);
  if (email) return `email:${email}`;
  const phone = normalizePhone(order?.customer?.phone);
  if (phone) return `phone:${phone}`;
  return 'guest';
}

function emptyCustomer(key) {
  return {
    id: key,
    customerId: null,
    name: '',
    email: '',
    phone: '',
    orderCount: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    totalSpent: 0,
    firstOrderAt: null,
    lastOrderAt: null,
    isGuest: key === 'guest',
  };
}

function accumulate(customer, order) {
  const created = order.createdAt || order.placedAt || null;
  customer.orderCount += 1;

  if (order.isCancelled) {
    customer.cancelledOrders += 1;
  } else {
    customer.completedOrders += 1;
    customer.totalSpent = Math.round((customer.totalSpent + (Number(order.total) || 0)) * 100) / 100;
  }

  if (created) {
    if (!customer.firstOrderAt || created < customer.firstOrderAt) {
      customer.firstOrderAt = created;
    }
    if (!customer.lastOrderAt || created > customer.lastOrderAt) {
      customer.lastOrderAt = created;
    }
  }

  if (!customer.name && order.customer?.fullName) customer.name = order.customer.fullName;
  if (!customer.email && order.customer?.email) customer.email = order.customer.email;
  if (!customer.phone && order.customer?.phone) customer.phone = order.customer.phone;
  if (!customer.customerId && order.customerId) customer.customerId = order.customerId;
  return customer;
}

export async function getRestaurantCustomers(restaurantId) {
  const orders = await getRestaurantOrders(restaurantId);
  const byKey = new Map();

  orders.forEach((order) => {
    const key = getCustomerKey(order);
    if (!byKey.has(key)) byKey.set(key, emptyCustomer(key));
    accumulate(byKey.get(key), order);
  });

  return Array.from(byKey.values())
    .map((customer) => ({
      ...customer,
      name: customer.name || (customer.email ? customer.email.split('@')[0] : 'Guest'),
    }))
    .sort((a, b) => {
      const da = a.lastOrderAt || '';
      const db = b.lastOrderAt || '';
      return db.localeCompare(da);
    });
}

export async function getRestaurantCustomerById(restaurantId, key) {
  if (!key) return null;
  const customers = await getRestaurantCustomers(restaurantId);
  return customers.find((customer) => customer.id === key) || null;
}

export async function getCustomerOrders(restaurantId, key) {
  if (!key) return [];
  const orders = await getRestaurantOrders(restaurantId);
  return orders
    .filter((order) => getCustomerKey(order) === key)
    .sort((a, b) => {
      const da = a.createdAt || '';
      const db = b.createdAt || '';
      return db.localeCompare(da);
    });
}

export function subscribeCustomers(listener, { restaurantId = null } = {}) {
  // Customers derive from orders, so an order change is a customer change.
  return subscribeOrders(listener, { restaurantId });
}

const customerService = {
  getRestaurantCustomers,
  getRestaurantCustomerById,
  getCustomerOrders,
  getCustomerKey,
  subscribeCustomers,
};

export default customerService;