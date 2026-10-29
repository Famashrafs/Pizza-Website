// Restro per-deployment configuration.
//
// One deployment = one restaurant. Edit this file when branding a new
// deployment; operational settings an owner changes at runtime live in
// Firestore and are edited from the admin dashboard.
//
// PRECEDENCE (highest wins):
//   1. Trusted backend (functions/lib/orderCore.js): recomputes every line and
//      total from the live catalog and the live `restaurants/{id}` document.
//      Client values never override the amount that is charged.
//   2. Firestore `restaurants/{id}`: runtime-editable operational settings
//      (name, tagline, contact, address/hours, currency, taxRate, minOrder,
//      deliveryEnabled, deliveryFee, freeDeliveryThreshold, logo, coverImage).
//      A missing or malformed pricing document must NOT silently become a valid
//      checkout total: cartPricing.hasUsablePricing() and
//      checkoutLogic.getPricingReadiness() block submission.
//   3. This file: deployment branding and defaults for fields Firestore does
//      not carry (estimates, promotions, locale, theme, social links, payment
//      UI metadata, fulfillment defaults). These are display fallbacks only.
//
// keep-in-sync: functions/lib/restaurantDefaults.js (server pricing + promos)

// Stable identity of the restaurant owned by this deployment. Resources created
// through the customer-facing store (orders, products) are tagged with this id
// so every record is multi-tenant aware. The owner -> restaurant relationship
// is NEVER derived from here; it comes from the signed-in user's profile. In a
// production multi-tenant backend (Firestore) this maps to a generated
// restaurant document id, not a code constant.
export const RESTAURANT_ID = 'restaurant-pizza-demo';

export const RESTAURANT_SETTINGS = {
  // Branding and identity.
  name: 'Pizza',
  tagline: 'Wood-fired kitchen & delivery',
  description: 'Wood-fired kitchen & delivery',
  logo: '',
  coverImage: '',

  // Contact and social links.
  phone: '+1 (555) 012-3456',
  email: 'orders@pizza.example',
  social: {
    facebook: 'https://facebook.com',
    instagram: 'https://instagram.com',
    x: 'https://x.com',
  },

  // Locale and language options. Keep the currently enabled languages unchanged.
  locale: {
    defaultLanguage: 'en',
    supportedLanguages: [
      { code: 'en', label: 'English' },
      { code: 'ar', label: 'العربية' },
      { code: 'it', label: 'Italiano' },
    ],
    rtlLanguages: ['ar'],
    storageKey: 'pizza-language',
  },

  // Theme defaults. 'system' follows the visitor's OS preference.
  theme: {
    defaultMode: 'system',
    storageKey: 'pizza-theme',
  },

  // Money and pricing defaults. Firestore overrides these at runtime.
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

  // Fulfillment defaults used before the restaurant document loads.
  fulfillment: {
    defaultType: 'delivery',
    deliveryEnabled: true,
  },

  // Payment UI metadata. No provider is implemented; card/online stay disabled.
  payments: {
    defaultMethod: 'cash',
    methods: [
      {
        id: 'cash',
        label: 'Cash on Delivery',
        description: 'Pay in cash when your order is delivered or collected.',
        provider: 'cash',
        enabled: true,
        comingSoon: false,
      },
      {
        id: 'card',
        label: 'Card',
        description: 'Pay securely with a credit or debit card.',
        provider: null,
        enabled: false,
        comingSoon: true,
      },
      {
        id: 'online',
        label: 'Online Payment',
        description: 'Pay with Stripe, PayPal and more.',
        provider: null,
        enabled: false,
        comingSoon: true,
      },
    ],
  },

  // Promotion defaults. The same table is mirrored on the server.
  promotions: {
    codes: {
      PIZZA10: { type: 'percent', value: 10, label: '10% off your order' },
      WELCOME5: { type: 'fixed', value: 5, label: '$5 off your order' },
      FREEDELIVERY: { type: 'free-delivery', value: 0, label: 'Free delivery' },
    },
  },
};

export default RESTAURANT_SETTINGS;
