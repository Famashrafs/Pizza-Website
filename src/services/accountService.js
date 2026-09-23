// Customer account data layer. All customer account state (profile fields,
// addresses, payment-method metadata, preferences) lives in the localStorage
// stores already used by the app, and this module is the single place that
// reads/writes it. It deliberately does not depend on firebase so it stays
// unit-testable in isolation.

import {
  getUserData,
  saveUserData,
  getSavedAddresses,
  saveSavedAddresses,
  getFavorites,
} from './storage.js';
import { formatAddress } from '../utils/checkoutLogic.js';
import { isPaymentProviderConfigured } from './paymentService.js';

const now = () => new Date().toISOString();

export const PROFILE_COMPLETION_CRITERIA = [
  {
    key: 'name',
    label: 'Full name',
    hint: 'Add your full name',
    section: 'profile',
    complete: (p) => Boolean((p.displayName || '').trim()),
  },
  {
    key: 'email',
    label: 'Email',
    hint: 'Add your email address',
    section: 'profile',
    complete: (p) => Boolean((p.email || '').trim()),
  },
  {
    key: 'photo',
    label: 'Profile picture',
    hint: 'Add a profile picture',
    section: 'profile',
    complete: (p) => Boolean((p.photoURL || '').trim()),
  },
  {
    key: 'phone',
    label: 'Phone number',
    hint: 'Add your phone number',
    section: 'security',
    complete: (p) => Boolean((p.phone || '').trim()),
  },
  {
    key: 'address',
    label: 'Delivery address',
    hint: 'Add a delivery address',
    section: 'addresses',
    complete: (p) => Boolean((p.addresses || []).length),
  },
];

// Assembles the normalized customer account model used by the dashboard.
// Identity fields come from the Firestore `users/{uid}` document (`serverProfile`)
// and the auth record; only device-local data (addresses, payment metadata,
// favorites, preferences) is read from localStorage.
export function normalizeAccount(uid, authUser = null, serverProfile = null) {
  const prefs = getUserData(uid);
  const addresses = getSavedAddresses(uid);
  const paymentMethods = Array.isArray(prefs.paymentMethods)
    ? prefs.paymentMethods
    : [];
  return {
    userId: uid,
    name:
      authUser?.displayName ||
      serverProfile?.name ||
      serverProfile?.displayName ||
      '',
    email: authUser?.email || serverProfile?.email || '',
    emailVerified: Boolean(authUser?.emailVerified),
    photoURL: authUser?.photoURL || serverProfile?.photoURL || '',
    phone: serverProfile?.phone || prefs.phone || '',
    phoneVerified: Boolean(serverProfile?.phoneVerified),
    role: serverProfile?.role || null,
    restaurantId: serverProfile?.restaurantId || null,
    addresses,
    defaultAddressId: prefs.defaultAddressId || null,
    paymentMethods,
    defaultPaymentMethodId:
      paymentMethods.some((m) => m.id === prefs.defaultPaymentMethodId)
        ? prefs.defaultPaymentMethodId
        : paymentMethods.find((m) => m.isDefault)?.id ||
          paymentMethods[0]?.id ||
          null,
    favorites: getFavorites(uid),
    preferences:
      prefs.preferences && typeof prefs.preferences === 'object'
        ? prefs.preferences
        : {},
    createdAt: serverProfile?.createdAt || prefs.createdAt || null,
    updatedAt: serverProfile?.updatedAt || prefs.updatedAt || null,
  };
}

export function computeProfileCompletion(account = {}) {
  const items = PROFILE_COMPLETION_CRITERIA.map((criterion) => ({
    ...criterion,
    complete: criterion.complete(account),
  }));
  const complete = items.filter((item) => item.complete).length;
  const percent = Math.round((complete / items.length) * 100);
  return { percent, items };
}

export function getFirstIncomplete(account) {
  const items = computeProfileCompletion(account).items;
  return items.find((item) => !item.complete) || null;
}

// --- Profile ---

export function updateProfileField(uid, patch) {
  const profile = getUserData(uid);
  const next = { ...profile, ...patch, updatedAt: now() };
  if (!next.createdAt) next.createdAt = now();
  saveUserData(uid, next);
  return next;
}

// --- Addresses ---

// Migration: older addresses were stored as a plain {label, address} string
// pair. Today they carry structured `fields` so checkout can prefill them.
function migrateAddress(address) {
  if (address.fields) return address;
  return {
    ...address,
    fields: {
      street: address.address || '',
      building: '',
      apartment: '',
      floor: '',
      landmark: '',
      city: '',
      phone: '',
    },
  };
}

export function getAddresses(uid) {
  return getSavedAddresses(uid).map(migrateAddress);
}

export function makeAddressEntry(fields, { label, isDefault, id }) {
  const clean = {
    street: String(fields?.street || '').trim(),
    area: String(fields?.area || '').trim(),
    building: String(fields?.building || '').trim(),
    apartment: String(fields?.apartment || '').trim(),
    floor: String(fields?.floor || '').trim(),
    landmark: String(fields?.landmark || '').trim(),
    city: String(fields?.city || '').trim(),
    phone: String(fields?.phone || '').trim(),
  };
  return {
    id:
      id ||
      `addr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: String(label || 'Other').trim(),
    fields: clean,
    address: formatAddress(clean),
    isDefault: Boolean(isDefault),
    createdAt: now(),
  };
}

export function writeAddresses(uid, addresses) {
  saveSavedAddresses(uid, addresses);
  const defaultId = addresses.find((addr) => addr.isDefault)?.id || null;
  updateProfileField(uid, {
    defaultAddressId: defaultId,
    address: defaultId
      ? addresses.find((addr) => addr.id === defaultId)?.address || ''
      : '',
  });
  return addresses;
}

export function setDefaultAddress(uid, addressId) {
  const next = getAddresses(uid).map((addr) => ({
    ...addr,
    isDefault: addr.id === addressId,
  }));
  return writeAddresses(uid, next);
}

// Removes an address. When the default is removed, the first remaining address
// becomes the default so the dashboard always has a usable default.
export function removeAddress(uid, addressId) {
  const remaining = getAddresses(uid).filter((addr) => addr.id !== addressId);
  const next = remaining.map((addr, index) => ({
    ...addr,
    isDefault: remaining.length > 0 ? index === 0 : false,
  }));
  return writeAddresses(uid, next);
}

// --- Payment methods (safe metadata only — never raw card data) ---

export function getStoredPaymentMethods(uid) {
  const profile = getUserData(uid);
  return Array.isArray(profile.paymentMethods) ? profile.paymentMethods : [];
}

export function maskCardNumber(brand, last4) {
  return `•••• •••• •••• ${String(last4 || '').padStart(4, '0')}`;
}

// Adds a payment method record. Since the project does not yet wire a
// PCI-compliant provider, this refuses to store anything unless a provider
// token is present — raw card numbers are never accepted.
export function addPaymentMethod(uid, method) {
  if (!isPaymentProviderConfigured()) {
    return {
      success: false,
      reason: 'provider-required',
      error:
        'Saving a card requires a PCI-compliant payment provider (e.g. Stripe). This project has no payment provider configured yet.',
    };
  }
  if (!method || !method.token || !method.provider) {
    return {
      success: false,
      reason: 'missing-token',
      error: 'A payment-provider token is required to save a card.',
    };
  }
  const profile = getUserData(uid);
  const methodId = method.id || `pm-${Date.now()}`;
  const entry = {
    id: methodId,
    brand: String(method.brand || 'Card').toUpperCase(),
    last4: String(method.last4 || '').slice(-4),
    expMonth: Number(method.expMonth) || null,
    expYear: Number(method.expYear) || null,
    provider: method.provider,
    isDefault: Boolean(method.isDefault) || !profile.paymentMethods?.length,
    createdAt: now(),
  };
  const list = [...getStoredPaymentMethods(uid), entry].map((item) => ({
    ...item,
    isDefault: entry.isDefault ? item.id === entry.id : item.isDefault,
  }));
  saveUserData(uid, {
    ...profile,
    paymentMethods: list,
    defaultPaymentMethodId: entry.isDefault
      ? entry.id
      : profile.defaultPaymentMethodId || list[0].id,
    updatedAt: now(),
  });
  return { success: true, method: entry };
}

export function removePaymentMethod(uid, methodId) {
  const remaining = getStoredPaymentMethods(uid).filter(
    (m) => m.id !== methodId
  );
  const next = remaining.map((m, index) => ({
    ...m,
    isDefault: remaining.length > 0 ? index === 0 : false,
  }));
  saveUserData(uid, {
    ...getUserData(uid),
    paymentMethods: next,
    defaultPaymentMethodId: next.find((m) => m.isDefault)?.id || null,
    updatedAt: now(),
  });
  return next;
}

export function setDefaultPaymentMethod(uid, methodId) {
  const next = getStoredPaymentMethods(uid).map((m) => ({
    ...m,
    isDefault: m.id === methodId,
  }));
  saveUserData(uid, {
    ...getUserData(uid),
    paymentMethods: next,
    defaultPaymentMethodId: methodId,
    updatedAt: now(),
  });
  return next;
}

// --- Preferences (settings section) ---

export const DEFAULT_PREFERENCES = {
  notifications: {
    orderUpdates: true,
    promotions: false,
    offers: true,
    email: true,
  },
  privacy: { shareUsageData: true },
  language: 'en',
};

export function getPreferences(uid) {
  const profile = getUserData(uid);
  const stored = profile.preferences || {};
  return {
    notifications: {
      ...DEFAULT_PREFERENCES.notifications,
      ...(stored.notifications || {}),
    },
    privacy: {
      ...DEFAULT_PREFERENCES.privacy,
      ...(stored.privacy || {}),
    },
    language: stored.language || DEFAULT_PREFERENCES.language,
  };
}

export function updatePreferences(uid, patch) {
  const current = getPreferences(uid);
  const next = {
    ...current,
    ...patch,
    notifications: { ...current.notifications, ...(patch.notifications || {}) },
    privacy: { ...current.privacy, ...(patch.privacy || {}) },
  };
  updateProfileField(uid, { preferences: next });
  return next;
}

// --- Overview stats ---

export function computeOrderStats(orders = []) {
  const total = orders.reduce((sum, order) => {
    if (order.isCancelled || order.orderStatus === 'cancelled') return sum;
    return sum + Number(order.total || 0);
  }, 0);
  const count = Array.isArray(orders) ? orders.length : 0;
  return {
    count,
    totalSpent: Math.round(total * 100) / 100,
    activeCount: orders.filter(
      (order) => !order.isCancelled && order.orderStatus !== 'cancelled'
    ).length,
  };
}

export function computeOverview(account, orders = []) {
  const stats = computeOrderStats(orders);
  return {
    ordersCount: stats.count,
    totalSpent: stats.totalSpent,
    activeOrders: stats.activeCount,
    favoritesCount: (account?.favorites || []).length,
    addressesCount: (account?.addresses || []).length,
    recentOrders: orders.slice(0, 3),
  };
}

const accountService = {
  normalizeAccount,
  computeProfileCompletion,
  getFirstIncomplete,
  updateProfileField,
  getAddresses,
  makeAddressEntry,
  writeAddresses,
  setDefaultAddress,
  removeAddress,
  getStoredPaymentMethods,
  maskCardNumber,
  addPaymentMethod,
  removePaymentMethod,
  setDefaultPaymentMethod,
  getPreferences,
  updatePreferences,
  computeOrderStats,
  computeOverview,
};

export default accountService;