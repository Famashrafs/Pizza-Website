// Server-side defaults for the deployment restaurant.
//
// The Firestore `restaurants/{id}` document is the AUTHORITATIVE source of
// business settings (tax, fees, thresholds, hours). These constants are only
// the code fallback used when a restaurant document has not been seeded yet or
// omits a field, and they intentionally mirror `src/config/restaurant.js` on
// the client.
//
// keep-in-sync: src/config/restaurant.js

'use strict';

const RESTAURANT_ID = 'restaurant-pizza-demo';

const RESTAURANT_SETTINGS = {
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
    estimatedMinutes: [35, 50],
  },
  pickup: {
    address: '42 Slice Street, Downtown',
    hours: 'Daily · 11:00 – 23:00',
    estimatedMinutes: [15, 25],
  },
};

module.exports = { RESTAURANT_ID, RESTAURANT_SETTINGS };