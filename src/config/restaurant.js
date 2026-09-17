// Single source of truth for restaurant-level settings. Anything a manager
// might change later (fees, thresholds, hours, pickup info) lives here so it is
// configurable instead of hardcoded across the UI.

// Stable identity of the restaurant owned by this deployment. Resources created
// through the customer-facing store (orders, products) are tagged with this id
// so every record is multi-tenant aware. The owner -> restaurant relationship
// is NEVER derived from here; it comes from the signed-in user's profile. In a
// production multi-tenant backend (Firestore) this maps to a generated
// restaurant document id, not a code constant.
export const RESTAURANT_ID = 'restaurant-pizza-demo';

export const RESTAURANT_SETTINGS = {
  name: 'Pizza',
  tagline: 'Wood-fired kitchen & delivery',
  phone: '+1 (555) 012-3456',
  email: 'orders@pizza.example',
  currency: '$',
  taxRate: 0.08,
  minOrder: 0,
  delivery: {
    baseFee: 3.99,
    freeDeliveryThreshold: 35,
    // [min, max] minutes
    estimatedMinutes: [35, 50],
  },
  pickup: {
    address: '42 Slice Street, Downtown',
    hours: 'Daily · 11:00 – 23:00',
    estimatedMinutes: [15, 25],
  },
};

export default RESTAURANT_SETTINGS;
