var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node-built-in-modules:node:crypto
import libDefault from "node:crypto";
var require_node_crypto = __commonJS({
  "node-built-in-modules:node:crypto"(exports, module) {
    module.exports = libDefault;
  }
});

// ../functions/lib/restaurantDefaults.js
var require_restaurantDefaults = __commonJS({
  "../functions/lib/restaurantDefaults.js"(exports, module) {
    "use strict";
    var RESTAURANT_ID = "restaurant-pizza-demo";
    var RESTAURANT_SETTINGS = {
      name: "Pizza",
      tagline: "Wood-fired kitchen & delivery",
      phone: "+1 (555) 012-3456",
      email: "orders@pizza.example",
      currency: "$",
      taxRate: 0.08,
      minOrder: 0,
      delivery: {
        baseFee: 3.99,
        freeDeliveryThreshold: 35,
        estimatedMinutes: [35, 50]
      },
      pickup: {
        address: "42 Slice Street, Downtown",
        hours: "Daily \xB7 11:00 \u2013 23:00",
        estimatedMinutes: [15, 25]
      },
      promotions: {
        codes: {
          PIZZA10: { type: "percent", value: 10, label: "10% off your order" },
          WELCOME5: { type: "fixed", value: 5, label: "$5 off your order" },
          FREEDELIVERY: { type: "free-delivery", value: 0, label: "Free delivery" }
        }
      }
    };
    var PROMO_CODES = RESTAURANT_SETTINGS.promotions.codes;
    module.exports = { RESTAURANT_ID, RESTAURANT_SETTINGS, PROMO_CODES };
  }
});

// ../functions/lib/orderCore.js
var require_orderCore = __commonJS({
  "../functions/lib/orderCore.js"(exports, module) {
    "use strict";
    var crypto2 = require_node_crypto();
    var { RESTAURANT_SETTINGS, PROMO_CODES } = require_restaurantDefaults();
    var MAX_INSTRUCTIONS = 200;
    var ORDER_STATUS = { PENDING: "placed" };
    var PAYMENT_METHODS = [
      { id: "cash", label: "Cash on Delivery", provider: "cash", enabled: true },
      { id: "card", label: "Card", provider: null, enabled: false },
      { id: "online", label: "Online Payment", provider: null, enabled: false }
    ];
    var round2 = /* @__PURE__ */ __name((value) => Math.round((Number(value) || 0) * 100) / 100, "round2");
    var slug = /* @__PURE__ */ __name((value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""), "slug");
    var normalizeQty = /* @__PURE__ */ __name((qty) => {
      const value = Math.floor(Number(qty));
      return Number.isFinite(value) && value >= 1 ? value : 1;
    }, "normalizeQty");
    function normalizeSettings(raw) {
      const doc = raw && typeof raw === "object" ? raw : {};
      const num = /* @__PURE__ */ __name((key, fallback) => {
        const value = Number(doc[key]);
        return Number.isFinite(value) && value >= 0 ? value : fallback;
      }, "num");
      return {
        currency: String(doc.currency || RESTAURANT_SETTINGS.currency || "$").trim() || "$",
        taxRate: num("taxRate", RESTAURANT_SETTINGS.taxRate),
        minOrder: num("minOrder", RESTAURANT_SETTINGS.minOrder),
        deliveryFee: num("deliveryFee", RESTAURANT_SETTINGS.delivery.baseFee),
        freeDeliveryThreshold: num(
          "freeDeliveryThreshold",
          RESTAURANT_SETTINGS.delivery.freeDeliveryThreshold
        ),
        deliveryEnabled: doc.deliveryEnabled !== false,
        deliveryEstimated: RESTAURANT_SETTINGS.delivery.estimatedMinutes,
        pickupEstimated: RESTAURANT_SETTINGS.pickup.estimatedMinutes
      };
    }
    __name(normalizeSettings, "normalizeSettings");
    function resolveSize(product, sizeLabel) {
      const sizes = product.sizes || [];
      if (!sizes.length) return null;
      if (sizeLabel) {
        const match = sizes.find((size) => size.label === sizeLabel);
        if (match) return match;
      }
      const fallback = sizes.find((size) => size.label === product.defaultSize);
      return fallback || sizes[0] || null;
    }
    __name(resolveSize, "resolveSize");
    function resolveCrust(product, crustId) {
      const crusts = product.crusts || [];
      if (!crusts.length) return null;
      const available = crusts.filter((crust) => crust.available !== false);
      if (crustId) {
        const match = available.find((crust) => crust.id === crustId);
        if (match) return match;
      }
      const fallback = available.find((crust) => crust.id === product.defaultCrust);
      return fallback || available[0] || null;
    }
    __name(resolveCrust, "resolveCrust");
    function resolveToppings(product, toppingIds = []) {
      const list = product.toppings || [];
      const ids = Array.isArray(toppingIds) ? toppingIds : [];
      return list.filter((topping) => ids.includes(topping.id));
    }
    __name(resolveToppings, "resolveToppings");
    function validateConfiguration(product, config) {
      const { size = null, crust = null, toppings = [], qty = 1, instructions = "" } = config || {};
      const errors = [];
      if ((product.sizes || []).length && !size) errors.push("Please select a size.");
      if ((product.crusts || []).filter((c) => c.available !== false).length && !crust) {
        errors.push("Please select a crust.");
      }
      const catalog = product.toppings || [];
      const unavailable = toppings.filter((topping) => topping.available === false);
      if (unavailable.length) {
        errors.push(
          `Remove unavailable toppings: ${unavailable.map((t) => t.name).join(", ")}.`
        );
      }
      if (toppings.some((topping) => !catalog.some((entry) => entry.id === topping.id))) {
        errors.push("One or more selected toppings are no longer available.");
      }
      const max = Number(product.maxToppings) || 0;
      if (max > 0 && toppings.length > max) errors.push(`Choose at most ${max} toppings.`);
      if (!Number.isInteger(Number(qty)) || Number(qty) < 1) {
        errors.push("Quantity must be a whole number of at least 1.");
      }
      if (String(instructions).length > MAX_INSTRUCTIONS) {
        errors.push(`Special instructions must be ${MAX_INSTRUCTIONS} characters or fewer.`);
      }
      return { valid: errors.length === 0, errors };
    }
    __name(validateConfiguration, "validateConfiguration");
    function calculateUnitPrice(product, config) {
      const { size = null, crust = null, toppings = [] } = config || {};
      const base = Number(product.basePrice) || 0;
      const sizeAdjust = size ? Number(size.adjust) || 0 : 0;
      const crustPrice = crust ? Number(crust.price) || 0 : 0;
      const toppingsTotal = (toppings || []).reduce(
        (sum, topping) => sum + (Number(topping.price) || 0),
        0
      );
      return round2(base + sizeAdjust + crustPrice + toppingsTotal);
    }
    __name(calculateUnitPrice, "calculateUnitPrice");
    function createCartItem(product, config) {
      const size = config.size ?? resolveSize(product, config.sizeLabel);
      const crust = config.crust ?? resolveCrust(product, config.crustId);
      const toppings = (config.toppings ? config.toppings : resolveToppings(product, config.toppingIds)).slice();
      const qty = normalizeQty(config.qty);
      const instructions = String(config.instructions ?? "").trim().slice(0, MAX_INSTRUCTIONS);
      if (!validateConfiguration(product, { size, crust, toppings, qty, instructions }).valid) {
        return null;
      }
      const unitPrice = calculateUnitPrice(product, { size, crust, toppings });
      const sortedToppings = [...toppings].sort((a, b) => a.id.localeCompare(b.id));
      const configKey = [
        size ? slug(size.label) : "nosize",
        crust ? slug(crust.id || crust.label) : "nocrust",
        ...sortedToppings.map((topping) => topping.id),
        instructions ? `note-${slug(instructions)}` : "nonote"
      ].join("|");
      const optionNames = [];
      if (size) optionNames.push(size.label);
      if (crust) optionNames.push(crust.label);
      const toppingNames = sortedToppings.map((topping) => topping.name);
      return {
        id: `${product.id}__${configKey}`,
        productId: product.id,
        name: `${product.name}${optionNames.length ? ` (${optionNames.join(", ")})` : ""}`,
        price: unitPrice,
        unitPrice,
        image: product.image,
        size: size ? size.label : null,
        crust: crust ? crust.label : null,
        toppings: toppingNames,
        desc: toppingNames.length ? `Toppings: ${toppingNames.join(", ")}` : "",
        instructions,
        lineTotal: round2(unitPrice * qty),
        config: {
          sizeLabel: size ? size.label : null,
          crustId: crust ? crust.id : null,
          toppingIds: sortedToppings.map((topping) => topping.id),
          instructions
        },
        qty
      };
    }
    __name(createCartItem, "createCartItem");
    function createSimpleCartItem(product) {
      const unitPrice = Number(product.basePrice) || 0;
      return {
        id: product.id,
        productId: product.id,
        name: product.name,
        price: unitPrice,
        unitPrice,
        image: product.image,
        size: null,
        crust: null,
        toppings: [],
        desc: "",
        instructions: "",
        lineTotal: unitPrice,
        config: null,
        qty: 1
      };
    }
    __name(createSimpleCartItem, "createSimpleCartItem");
    function recalculateItems(cartItems = [], products = []) {
      const byId = new Map((products || []).map((product) => [product.id, product]));
      const items = [];
      const issues = [];
      for (const line of cartItems || []) {
        const product = byId.get(line && line.productId);
        if (!product) {
          issues.push({
            id: line && line.id,
            name: line && line.name || "Item",
            reason: "This item is no longer on the menu."
          });
          continue;
        }
        if (product.available === false) {
          issues.push({
            id: line && line.id,
            name: line && line.name || product.name,
            reason: "This item is currently unavailable."
          });
          continue;
        }
        const qty = Math.max(1, Math.floor(Number(line.qty) || 1));
        const rebuilt = line.config ? createCartItem(product, { ...line.config, qty }) : createSimpleCartItem(product);
        if (!rebuilt) {
          issues.push({
            id: line && line.id,
            name: line && line.name || product.name,
            reason: "The selected options are no longer available."
          });
          continue;
        }
        items.push({
          ...rebuilt,
          qty,
          unitPrice: rebuilt.unitPrice,
          lineTotal: round2(rebuilt.unitPrice * qty)
        });
      }
      return { items, issues };
    }
    __name(recalculateItems, "recalculateItems");
    function resolveDiscount(promoCode, subtotal, promoTable = PROMO_CODES) {
      const code = String(promoCode || "").trim().toUpperCase();
      const entry = code ? promoTable[code] : null;
      if (!entry) {
        return { code: null, amount: 0, freeDelivery: false, label: "" };
      }
      if (entry.type === "percent") {
        return {
          code,
          amount: round2(subtotal * entry.value / 100),
          freeDelivery: false,
          label: entry.label
        };
      }
      if (entry.type === "fixed") {
        return {
          code,
          amount: round2(Math.min(entry.value, subtotal)),
          freeDelivery: false,
          label: entry.label
        };
      }
      if (entry.type === "free-delivery") {
        return { code, amount: 0, freeDelivery: true, label: entry.label };
      }
      return { code: null, amount: 0, freeDelivery: false, label: "" };
    }
    __name(resolveDiscount, "resolveDiscount");
    function calculateTotals(items = [], options = {}) {
      const { promoCode = "", fulfillmentType = "delivery", settings } = options;
      const plan = normalizeSettings(settings);
      const subtotal = round2(
        (items || []).reduce(
          (sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.qty) || 0),
          0
        )
      );
      const itemCount = (items || []).reduce(
        (sum, item) => sum + (Number(item.qty) || 0),
        0
      );
      const promo = resolveDiscount(promoCode, subtotal);
      const discount = Math.min(promo.amount, subtotal);
      const taxable = Math.max(0, round2(subtotal - discount));
      let shipping = 0;
      let free = false;
      let reason = null;
      if (fulfillmentType === "pickup") {
        free = true;
        reason = "pickup";
      } else if (subtotal <= 0) {
        reason = "empty";
      } else {
        const reached = subtotal >= plan.freeDeliveryThreshold;
        free = promo.freeDelivery || reached;
        shipping = free ? 0 : round2(plan.deliveryFee);
        reason = promo.freeDelivery ? "promo" : reached ? "threshold" : "standard";
      }
      const tax = round2(taxable * plan.taxRate);
      const total = round2(taxable + shipping + tax);
      return {
        subtotal,
        itemCount,
        discount,
        discountLabel: promo.label,
        promoCode: promo.code,
        freeDelivery: free,
        deliveryFee: shipping,
        deliveryReason: reason,
        fulfillmentType,
        tax,
        taxRate: plan.taxRate,
        total
      };
    }
    __name(calculateTotals, "calculateTotals");
    function isEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
    }
    __name(isEmail, "isEmail");
    function digitsOnly(value) {
      return String(value || "").replace(/[^\d]/g, "");
    }
    __name(digitsOnly, "digitsOnly");
    function validateCustomerInfo(customer = {}) {
      const errors = {};
      if (!String(customer.fullName || "").trim()) {
        errors.fullName = "Please enter the name for this order.";
      }
      if (!String(customer.email || "").trim()) {
        errors.email = "Please enter your email address.";
      } else if (!isEmail(customer.email)) {
        errors.email = "Please enter a valid email address.";
      }
      if (!String(customer.phone || "").trim()) {
        errors.phone = "Please enter a phone number for order updates.";
      } else if (digitsOnly(customer.phone).length < 7) {
        errors.phone = "Please enter a valid phone number.";
      }
      return errors;
    }
    __name(validateCustomerInfo, "validateCustomerInfo");
    function validateAddress(address = {}, fulfillmentType = "delivery") {
      if (fulfillmentType === "pickup") return {};
      const errors = {};
      if (!String(address.street || "").trim()) {
        errors.street = "Street address is required for delivery.";
      }
      if (!String(address.city || "").trim()) {
        errors.city = "City is required for delivery.";
      }
      if (!String(address.phone || "").trim()) {
        errors.phone = "A contact phone number is required for delivery.";
      } else if (digitsOnly(address.phone).length < 7) {
        errors.phone = "Please enter a valid phone number.";
      }
      return errors;
    }
    __name(validateAddress, "validateAddress");
    function formatAddress(address = {}) {
      if (!address) return "";
      return [
        address.street,
        address.building ? `Bldg ${address.building}` : "",
        address.apartment ? `Apt ${address.apartment}` : "",
        address.floor ? `Floor ${address.floor}` : "",
        address.city,
        address.landmark ? `Near ${address.landmark}` : ""
      ].filter(Boolean).join(", ");
    }
    __name(formatAddress, "formatAddress");
    function getPaymentMethod(id) {
      return PAYMENT_METHODS.find((method) => method.id === id) || null;
    }
    __name(getPaymentMethod, "getPaymentMethod");
    function generateGuestToken() {
      return crypto2.randomBytes(24).toString("base64url");
    }
    __name(generateGuestToken, "generateGuestToken");
    function sha256hex(value) {
      return crypto2.createHash("sha256").update(String(value)).digest("hex");
    }
    __name(sha256hex, "sha256hex");
    function verifyGuestToken(token, hash) {
      if (!token || !hash) return false;
      const expected = Buffer.from(String(hash), "hex");
      const actual = Buffer.from(sha256hex(String(token)), "hex");
      if (expected.length !== actual.length || expected.length === 0) return false;
      return crypto2.timingSafeEqual(expected, actual);
    }
    __name(verifyGuestToken, "verifyGuestToken");
    function stableStringify(value) {
      if (value === null || typeof value !== "object") {
        return JSON.stringify(value === void 0 ? null : value);
      }
      if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
      }
      const keys = Object.keys(value).sort();
      return `{${keys.filter((key) => value[key] !== void 0).map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    __name(stableStringify, "stableStringify");
    function buildRequestSignature(payload = {}) {
      const customer = payload.customer || {};
      const canonical = {
        restaurantId: String(payload.restaurantId || ""),
        items: (payload.items || []).map((item) => ({
          productId: item ? item.productId : null,
          qty: Number(item && item.qty) || 0,
          config: item && item.config || null
        })),
        customer: {
          fullName: String(customer.fullName || "").trim(),
          email: String(customer.email || "").trim().toLowerCase(),
          phone: String(customer.phone || "").trim()
        },
        fulfillmentType: payload.fulfillmentType || "delivery",
        address: payload.address || null,
        paymentMethod: payload.paymentMethod || "",
        customerNotes: String(payload.customerNotes || "").trim(),
        promoCode: String(payload.promoCode || "").trim().toUpperCase()
      };
      return sha256hex(stableStringify(canonical));
    }
    __name(buildRequestSignature, "buildRequestSignature");
    function generateOrderId() {
      const stamp = Date.now().toString(36).toUpperCase().slice(-6);
      const rand = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0");
      return `ORD-${stamp}${rand}`;
    }
    __name(generateOrderId, "generateOrderId");
    function buildOrder({
      uid,
      isAnonymous = false,
      restaurantId,
      restaurantExists = true,
      products = [],
      settings,
      cartItems = [],
      customer = {},
      fulfillmentType = "delivery",
      address = null,
      paymentMethod = "",
      customerNotes = "",
      promoCode = "",
      idempotencyKey = null
    } = {}) {
      const errors = {};
      const plan = normalizeSettings(settings);
      if (!(cartItems || []).length) {
        errors.cart = "Your cart is empty.";
      }
      if (!uid) {
        errors.auth = "You must be signed in to place an order.";
      }
      const customerErrors = validateCustomerInfo(customer);
      if (Object.keys(customerErrors).length) errors.customer = customerErrors;
      const addressErrors = validateAddress(address || {}, fulfillmentType);
      if (Object.keys(addressErrors).length) errors.address = addressErrors;
      const payment = getPaymentMethod(paymentMethod);
      if (!payment) {
        errors.payment = "Please choose a payment method.";
      } else if (!payment.enabled) {
        errors.payment = `${payment.label} is not available yet. Please choose another method.`;
      }
      if (!restaurantId) {
        errors.restaurant = "This store is unavailable right now. Please try again later.";
      } else if (!restaurantExists) {
        errors.restaurant = "This store is unavailable right now. Please try again later.";
      }
      if (fulfillmentType === "delivery" && !plan.deliveryEnabled) {
        errors.fulfillment = "Delivery is currently unavailable. Please choose pickup.";
      }
      const scopedProducts = (products || []).filter(
        (product) => !product || !product.restaurantId || product.restaurantId === restaurantId
      );
      const { items, issues } = recalculateItems(cartItems, scopedProducts);
      if (issues.length) errors.items = issues;
      if (Object.keys(errors).length) {
        return {
          success: false,
          errors,
          error: "We could not place your order. Please review the highlighted fields."
        };
      }
      const totals = calculateTotals(items, { promoCode, fulfillmentType, settings });
      if (plan.minOrder > 0 && totals.total < plan.minOrder) {
        return {
          success: false,
          errors: {
            cart: `Orders under the $${plan.minOrder} minimum are not accepted.`
          },
          error: `Orders under the $${plan.minOrder} minimum are not accepted.`
        };
      }
      const phone = String(customer.phone || "").trim();
      const normalizedAddress = fulfillmentType === "pickup" ? null : {
        street: String(address.street || "").trim(),
        area: String(address.area || "").trim(),
        building: String(address.building || "").trim(),
        apartment: String(address.apartment || "").trim(),
        floor: String(address.floor || "").trim(),
        landmark: String(address.landmark || "").trim(),
        city: String(address.city || "").trim(),
        phone: String(address.phone || phone).trim()
      };
      const nowISO = (/* @__PURE__ */ new Date()).toISOString();
      const orderId = generateOrderId();
      let trackingToken = null;
      if (isAnonymous) {
        trackingToken = generateGuestToken();
      }
      const order = {
        restaurantId,
        customerId: uid,
        // Display/analytics tag only — the anonymous auth provider is the source of
        // truth. Never grants or denies anything by itself.
        customerType: isAnonymous ? "guest" : "customer",
        customer: {
          fullName: String(customer.fullName || "").trim(),
          email: String(customer.email || "").trim(),
          phone
        },
        items,
        subtotal: totals.subtotal,
        deliveryFee: totals.deliveryFee,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        promoCode: totals.promoCode || null,
        pricing: {
          subtotal: totals.subtotal,
          discount: totals.discount,
          promoCode: totals.promoCode,
          deliveryFee: totals.deliveryFee,
          freeDelivery: totals.freeDelivery,
          tax: totals.tax,
          taxRate: totals.taxRate,
          fulfillmentType
        },
        fulfillmentType,
        address: normalizedAddress,
        addressText: normalizedAddress ? formatAddress(normalizedAddress) : null,
        paymentMethod: payment.id,
        // Server-computed: cash always starts pending and is NEVER set to "paid"
        // by this function — a provider verification would be required.
        paymentStatus: "pending",
        paymentProvider: payment.provider,
        orderStatus: ORDER_STATUS.PENDING,
        customerNotes: String(customerNotes || "").trim(),
        estimatedTime: getEstimatedTime(fulfillmentType, plan),
        checkoutId: idempotencyKey || null,
        statusHistory: [
          { status: ORDER_STATUS.PENDING, at: nowISO, changedBy: "customer" }
        ],
        createdAt: nowISO,
        updatedAt: nowISO,
        ...trackingToken ? { guestTokenHash: sha256hex(trackingToken) } : {}
      };
      return {
        success: true,
        orderId,
        order,
        ...trackingToken ? { trackingToken } : {}
      };
    }
    __name(buildOrder, "buildOrder");
    function getEstimatedTime(fulfillmentType, plan) {
      const range = fulfillmentType === "pickup" ? plan.pickupEstimated : plan.deliveryEstimated;
      return `${range[0]}\u2013${range[1]} min`;
    }
    __name(getEstimatedTime, "getEstimatedTime");
    module.exports = {
      buildOrder,
      normalizeSettings,
      recalculateItems,
      calculateTotals,
      validateCustomerInfo,
      validateAddress,
      generateOrderId,
      generateGuestToken,
      sha256hex,
      verifyGuestToken,
      stableStringify,
      buildRequestSignature,
      PAYMENT_METHODS,
      PROMO_CODES
    };
  }
});

// ../functions/lib/orderServiceCore.js
var require_orderServiceCore = __commonJS({
  "../functions/lib/orderServiceCore.js"(exports, module) {
    "use strict";
    var crypto2 = require_node_crypto();
    var {
      buildOrder,
      verifyGuestToken,
      buildRequestSignature,
      generateGuestToken,
      sha256hex
    } = require_orderCore();
    var { RESTAURANT_ID } = require_restaurantDefaults();
    var receiptId = /* @__PURE__ */ __name((uid, restaurantId, checkoutId) => crypto2.createHash("sha1").update(`${uid}:${restaurantId}:${checkoutId || ""}`).digest("hex"), "receiptId");
    function serializeOrder(doc) {
      if (!doc || typeof doc !== "object") return doc;
      const stamp = /* @__PURE__ */ __name((value) => value && typeof value.toDate === "function" ? value.toDate().toISOString() : value, "stamp");
      return {
        ...doc,
        createdAt: stamp(doc.createdAt),
        updatedAt: stamp(doc.updatedAt),
        cancelledAt: stamp(doc.cancelledAt),
        statusUpdatedAt: stamp(doc.statusUpdatedAt),
        statusHistory: Array.isArray(doc.statusHistory) ? doc.statusHistory.map((entry) => ({ ...entry, at: stamp(entry.at) })) : doc.statusHistory
      };
    }
    __name(serializeOrder, "serializeOrder");
    function withoutGuestToken(doc) {
      if (!doc || typeof doc !== "object") return doc;
      const { guestTokenHash: _hash, ...rest } = doc;
      return rest;
    }
    __name(withoutGuestToken, "withoutGuestToken");
    function sanitize(value) {
      if (value === void 0 || value === null) return value;
      if (Array.isArray(value)) return value.map(sanitize);
      if (typeof value === "object") {
        const out = {};
        for (const key of Object.keys(value)) {
          if (value[key] !== void 0) out[key] = sanitize(value[key]);
        }
        return out;
      }
      return value;
    }
    __name(sanitize, "sanitize");
    function serializedShaped(order) {
      return withoutGuestToken(serializeOrder(order));
    }
    __name(serializedShaped, "serializedShaped");
    function createOrderService2({ db, serverTimestamp: serverTimestamp2 } = {}) {
      if (!db || typeof db.runTransaction !== "function") {
        throw new Error("createOrderService requires a Firestore-compatible `db`.");
      }
      if (typeof serverTimestamp2 !== "function") {
        throw new Error("createOrderService requires a `serverTimestamp` factory.");
      }
      async function getGuestOrder({ data } = {}) {
        const orderId = String(data && data.orderId || "").trim();
        const token = String(data && data.token || "");
        if (!orderId || !token) {
          return { success: false, error: "Order not found." };
        }
        const snap = await db.collection("orders").doc(orderId).get();
        if (!snap.exists) {
          return { success: false, error: "Order not found." };
        }
        const doc = snap.data();
        if (!verifyGuestToken(token, doc.guestTokenHash)) {
          return { success: false, error: "Order not found." };
        }
        return { success: true, order: serializedShaped({ ...doc, id: snap.id }) };
      }
      __name(getGuestOrder, "getGuestOrder");
      async function createOrder({ data: rawData, auth } = {}) {
        const uid = auth && auth.uid || null;
        const isAnonymous = Boolean(
          auth && auth.token && auth.token.firebase && auth.token.firebase.sign_in_provider === "anonymous"
        );
        if (!uid) {
          return {
            success: false,
            error: "You must be signed in to place an order.",
            errors: { auth: "You must be signed in to place an order." }
          };
        }
        const payload = sanitize(rawData && rawData.data || rawData || {}) || {};
        const restaurantId = String(payload.restaurantId || RESTAURANT_ID);
        const checkoutId = String(payload.idempotencyKey || "");
        const requestSignature = buildRequestSignature({ ...payload, restaurantId });
        const restaurantRef = db.collection("restaurants").doc(restaurantId);
        const productsQuery = db.collection("products").where("restaurantId", "==", restaurantId);
        const receiptRef = db.collection("checkoutReceipts").doc(receiptId(uid, restaurantId, checkoutId));
        const result = await db.runTransaction(async (tx) => {
          const restaurantSnap = await tx.get(restaurantRef);
          const products = [];
          if (restaurantSnap.exists) {
            const productsSnap = await tx.get(productsQuery);
            productsSnap.forEach((doc) => products.push({ ...doc.data(), id: doc.id }));
          }
          const existing = await tx.get(receiptRef);
          if (existing.exists) {
            const receipt = existing.data();
            if (receipt.uid && receipt.uid !== uid || receipt.restaurantId && receipt.restaurantId !== restaurantId) {
              return {
                success: false,
                error: "This checkout could not be verified. Please start a new checkout.",
                errors: {}
              };
            }
            const orderRef2 = db.collection("orders").doc(receipt.orderId);
            const orderDoc = await tx.get(orderRef2);
            if (orderDoc.exists) {
              if (receipt.requestHash && receipt.requestHash !== requestSignature) {
                return {
                  success: false,
                  error: "This checkout could not be verified. Please start a new checkout.",
                  errors: {}
                };
              }
              const orderData = orderDoc.data();
              if (orderData.guestTokenHash) {
                const rotatedToken = generateGuestToken();
                tx.update(orderRef2, {
                  guestTokenHash: sha256hex(rotatedToken),
                  updatedAt: serverTimestamp2()
                });
                return {
                  success: true,
                  reuse: true,
                  orderId: receipt.orderId,
                  order: serializedShaped(orderData),
                  trackingToken: rotatedToken
                };
              }
              return {
                success: true,
                reuse: true,
                orderId: receipt.orderId,
                order: serializedShaped(orderData)
              };
            }
          }
          const built = buildOrder({
            uid,
            isAnonymous,
            restaurantId,
            restaurantExists: restaurantSnap.exists,
            settings: restaurantSnap.exists ? restaurantSnap.data() : null,
            products,
            cartItems: payload.items,
            customer: payload.customer || {},
            fulfillmentType: payload.fulfillmentType || "delivery",
            address: payload.address || null,
            paymentMethod: payload.paymentMethod || "",
            customerNotes: payload.customerNotes || "",
            promoCode: payload.promoCode || "",
            idempotencyKey: checkoutId || null
          });
          if (!built.success) return { success: false, ...built };
          const orderRef = db.collection("orders").doc(built.orderId);
          const { createdAt: _c, updatedAt: _u, ...docWithoutStamps } = built.order;
          const stored = {
            ...docWithoutStamps,
            createdAt: serverTimestamp2(),
            updatedAt: serverTimestamp2()
          };
          tx.set(receiptRef, {
            uid,
            restaurantId,
            checkoutId,
            orderId: built.orderId,
            requestHash: requestSignature,
            createdAt: serverTimestamp2()
          });
          tx.set(orderRef, stored);
          return {
            success: true,
            reuse: false,
            orderId: built.orderId,
            order: serializedShaped(built.order),
            trackingToken: built.trackingToken || null
          };
        });
        if (!result.success) {
          return result;
        }
        return {
          success: true,
          reuse: Boolean(result.reuse),
          // The client hydrates the returned order with `stored.id || result.orderId`
          // (see src/services/orderService.js createOrder), so both must be present:
          // the persisted doc carries no `id` of its own.
          orderId: result.orderId,
          order: { ...result.order, id: result.order && result.order.id ? result.order.id : result.orderId },
          ...result.trackingToken ? { trackingToken: result.trackingToken } : {}
        };
      }
      __name(createOrder, "createOrder");
      return { createOrder, getGuestOrder };
    }
    __name(createOrderService2, "createOrderService");
    module.exports = {
      createOrderService: createOrderService2,
      receiptId,
      serializeOrder,
      withoutGuestToken,
      sanitize,
      serializedShaped
    };
  }
});

// src/cors.js
var DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}
__name(normalizeOrigin, "normalizeOrigin");
function parseAllowedOrigins(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const list = raw.map(normalizeOrigin).filter(Boolean);
  return list.length ? list : DEFAULT_ALLOWED_ORIGINS.slice();
}
__name(parseAllowedOrigins, "parseAllowedOrigins");
function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return false;
  const origin_ = normalizeOrigin(origin);
  return allowedOrigins.some(
    (allowed) => allowed === origin_ || allowed === "*"
  );
}
__name(isOriginAllowed, "isOriginAllowed");
function corsHeadersFor(origin) {
  return {
    "Access-Control-Allow-Origin": normalizeOrigin(origin),
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Image-Kind,X-Original-Filename,X-Restaurant-Id",
    "Access-Control-Max-Age": "600"
  };
}
__name(corsHeadersFor, "corsHeadersFor");
function corsHeadersForRequest(origin, allowedOrigins) {
  if (!origin || !isOriginAllowed(origin, allowedOrigins)) return {};
  return corsHeadersFor(origin);
}
__name(corsHeadersForRequest, "corsHeadersForRequest");
function bearerToken(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header || "").trim());
  return match ? match[1].trim() : null;
}
__name(bearerToken, "bearerToken");

// src/errors.js
var ConfigurationError = class extends Error {
  static {
    __name(this, "ConfigurationError");
  }
  constructor(code, message2) {
    super(message2);
    this.name = "ConfigurationError";
    this.code = code;
  }
};
function isConfigurationError(err) {
  return Boolean(err) && err.name === "ConfigurationError";
}
__name(isConfigurationError, "isConfigurationError");
var UpstreamUnavailableError = class extends Error {
  static {
    __name(this, "UpstreamUnavailableError");
  }
  constructor(message2, {
    code = "upstream_unavailable",
    status = 503,
    cleanupMayHaveSucceeded = false
  } = {}) {
    super(message2);
    this.name = "UpstreamUnavailableError";
    this.code = code;
    this.status = status;
    this.cleanupMayHaveSucceeded = cleanupMayHaveSucceeded;
  }
};
function isUpstreamUnavailable(err) {
  return Boolean(err) && err.name === "UpstreamUnavailableError";
}
__name(isUpstreamUnavailable, "isUpstreamUnavailable");
var StorageConflictError = class extends Error {
  static {
    __name(this, "StorageConflictError");
  }
  constructor(message2 = "The image object already exists.") {
    super(message2);
    this.name = "StorageConflictError";
    this.code = "image_object_conflict";
    this.status = 409;
  }
};
function safeErrorMessage(err, secrets = []) {
  if (!err) return "unknown error";
  let raw = typeof err === "string" ? err : String(err.message || err.name || "unknown error");
  raw = raw.replace(/access_token=[^&\s"']+/gi, "access_token=REDACTED");
  for (const secret of secrets || []) {
    const value = String(secret || "");
    if (value.length >= 8) raw = raw.split(value).join("[REDACTED]");
  }
  return raw.slice(0, 300);
}
__name(safeErrorMessage, "safeErrorMessage");

// src/imageAuthorization.js
var ImageAuthorizationError = class extends Error {
  static {
    __name(this, "ImageAuthorizationError");
  }
  constructor(code, message2, status = 403) {
    super(message2);
    this.name = "ImageAuthorizationError";
    this.code = code;
    this.status = status;
  }
};
async function readDocument(db, path) {
  try {
    if (db && typeof db.getDocument === "function") {
      return await db.getDocument(path);
    }
    return null;
  } catch {
    throw new UpstreamUnavailableError("Firestore authorization lookup failed.");
  }
}
__name(readDocument, "readDocument");
function dataOf(snapshot) {
  return snapshot && snapshot.exists && typeof snapshot.data === "function" ? snapshot.data() : null;
}
__name(dataOf, "dataOf");
function isMemberOf(profile, restaurantId) {
  if (!profile || !restaurantId) return false;
  if (profile.restaurantId === restaurantId) return true;
  return Boolean(
    profile.restaurantIds && typeof profile.restaurantIds === "object" && profile.restaurantIds[restaurantId] === true
  );
}
__name(isMemberOf, "isMemberOf");
async function requireRegisteredProfile(db, uid) {
  const snapshot = await readDocument(db, `users/${uid}`);
  const profile = dataOf(snapshot);
  if (!profile) {
    throw new ImageAuthorizationError(
      "image_profile_not_found",
      "A registered profile is required to manage this image."
    );
  }
  if (profile.uid && profile.uid !== uid) {
    throw new ImageAuthorizationError(
      "image_profile_mismatch",
      "The image owner could not be verified."
    );
  }
  return profile;
}
__name(requireRegisteredProfile, "requireRegisteredProfile");
async function requireRestaurantManager(db, uid, restaurantId) {
  const profile = await requireRegisteredProfile(db, uid);
  const role = profile.role;
  const manager = role === "restaurant_owner" || role === "restaurant_admin";
  if (!manager || !isMemberOf(profile, restaurantId)) {
    throw new ImageAuthorizationError(
      "image_restaurant_forbidden",
      "You are not authorized to manage images for this restaurant."
    );
  }
  const restaurantSnapshot = await readDocument(db, `restaurants/${restaurantId}`);
  const restaurant = dataOf(restaurantSnapshot);
  if (!restaurant) {
    throw new ImageAuthorizationError(
      "image_restaurant_not_found",
      "The restaurant could not be verified."
    );
  }
  if (role === "restaurant_owner" && restaurant.ownerId !== uid) {
    throw new ImageAuthorizationError(
      "image_restaurant_forbidden",
      "You are not authorized to manage images for this restaurant."
    );
  }
  return { profile, restaurant };
}
__name(requireRestaurantManager, "requireRestaurantManager");
async function getDocumentData(db, path) {
  const snapshot = await readDocument(db, path);
  return dataOf(snapshot);
}
__name(getDocumentData, "getDocumentData");

// src/imageValidation.js
var MAX_IMAGE_BYTES = 4 * 1024 * 1024;
var SIGNED_URL_TTL_SECONDS = 5 * 60;
var IMAGE_KINDS = Object.freeze({
  PRODUCT: "product",
  RESTAURANT_LOGO: "restaurantLogo",
  RESTAURANT_COVER: "restaurantCover",
  CATEGORY: "category",
  CUSTOMER_PROFILE: "customerProfile"
});
var STORAGE_BUCKETS = Object.freeze({
  RESTAURANT_ASSETS: "restaurant-assets",
  PROFILE_IMAGES: "profile-images"
});
var TYPE_CONFIG = Object.freeze({
  "image/png": Object.freeze({ extension: "png", allowedExtensions: ["png"] }),
  "image/jpeg": Object.freeze({ extension: "jpg", allowedExtensions: ["jpg", "jpeg"] }),
  "image/webp": Object.freeze({ extension: "webp", allowedExtensions: ["webp"] }),
  "image/gif": Object.freeze({ extension: "gif", allowedExtensions: ["gif"] })
});
var PUBLIC_KINDS = /* @__PURE__ */ new Set([
  IMAGE_KINDS.PRODUCT,
  IMAGE_KINDS.RESTAURANT_LOGO,
  IMAGE_KINDS.RESTAURANT_COVER,
  IMAGE_KINDS.CATEGORY
]);
var SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var OBJECT_FILE = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(png|jpg|webp|gif)";
var ImageValidationError = class extends Error {
  static {
    __name(this, "ImageValidationError");
  }
  constructor(code, message2, status = 400) {
    super(message2);
    this.name = "ImageValidationError";
    this.code = code;
    this.status = status;
  }
};
function invalid(code, message2, status = 400) {
  throw new ImageValidationError(code, message2, status);
}
__name(invalid, "invalid");
function isPublicImageKind(kind) {
  return PUBLIC_KINDS.has(kind);
}
__name(isPublicImageKind, "isPublicImageKind");
function getStorageBucket(kind) {
  return kind === IMAGE_KINDS.CUSTOMER_PROFILE ? STORAGE_BUCKETS.PROFILE_IMAGES : STORAGE_BUCKETS.RESTAURANT_ASSETS;
}
__name(getStorageBucket, "getStorageBucket");
function normalizeImageKind(value) {
  const kind = String(value || "").trim();
  if (!Object.values(IMAGE_KINDS).includes(kind)) {
    invalid("image_kind_invalid", "The image kind is invalid.");
  }
  return kind;
}
__name(normalizeImageKind, "normalizeImageKind");
function validateSafeSegment(value, label) {
  const segment = String(value || "").trim();
  if (!SAFE_SEGMENT.test(segment)) {
    invalid("image_path_segment_invalid", `${label} is invalid.`);
  }
  return segment;
}
__name(validateSafeSegment, "validateSafeSegment");
function decodeOriginalFilename(value) {
  const raw = String(value || "").trim();
  if (!raw) invalid("image_filename_missing", "The original image filename is required.");
  if (raw.length > 512) invalid("image_filename_invalid", "The original image filename is invalid.");
  let decoded = raw;
  if (raw.includes("%")) {
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      invalid("image_filename_invalid", "The original image filename is invalid.");
    }
  }
  if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0") || /[\u0000-\u001f\u007f]/.test(decoded)) {
    invalid("image_filename_invalid", "The original image filename is invalid.");
  }
  return decoded;
}
__name(decodeOriginalFilename, "decodeOriginalFilename");
function extensionOf(filename) {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) {
    invalid("image_extension_invalid", "The image filename must have a valid extension.");
  }
  return filename.slice(dot + 1).toLowerCase();
}
__name(extensionOf, "extensionOf");
function validateUploadMetadata({
  kind,
  restaurantId,
  originalFilename,
  contentType,
  contentLength
} = {}) {
  const normalizedKind = normalizeImageKind(kind);
  const normalizedType = String(contentType || "").trim().toLowerCase();
  const type = TYPE_CONFIG[normalizedType];
  if (!type) {
    invalid("image_mime_invalid", "Images must be PNG, JPG, WEBP or GIF.", 415);
  }
  const filename = decodeOriginalFilename(originalFilename);
  const extension = extensionOf(filename);
  if (!type.allowedExtensions.includes(extension)) {
    invalid(
      "image_extension_mismatch",
      "The image filename extension does not match its MIME type.",
      415
    );
  }
  let normalizedRestaurantId = "";
  if (isPublicImageKind(normalizedKind)) {
    normalizedRestaurantId = validateSafeSegment(restaurantId, "Restaurant id");
  } else if (String(restaurantId || "").trim()) {
    invalid("image_restaurant_not_allowed", "A restaurant id is not valid for this image kind.");
  }
  if (contentLength != null && contentLength !== "") {
    const length = Number(contentLength);
    if (!Number.isFinite(length) || length < 0) {
      invalid("image_content_length_invalid", "The image content length is invalid.");
    }
    if (length > MAX_IMAGE_BYTES) {
      invalid("image_too_large", "The image is larger than the 4 MB limit.", 413);
    }
  }
  return {
    kind: normalizedKind,
    restaurantId: normalizedRestaurantId,
    originalFilename: filename,
    contentType: normalizedType,
    extension: type.extension
  };
}
__name(validateUploadMetadata, "validateUploadMetadata");
function startsWithBytes(bytes, expected, offset = 0) {
  if (bytes.length < offset + expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected[index]) return false;
  }
  return true;
}
__name(startsWithBytes, "startsWithBytes");
function ascii(bytes, start, end) {
  let value = "";
  for (let index = start; index < end && index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}
__name(ascii, "ascii");
function validateImageBytes(bytes, contentType) {
  if (!bytes || typeof bytes.byteLength !== "number" || bytes.byteLength === 0) {
    invalid("image_empty", "The uploaded image is empty.");
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    invalid("image_too_large", "The image is larger than the 4 MB limit.", 413);
  }
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
  const type = String(contentType || "").toLowerCase();
  let valid = false;
  if (type === "image/png") {
    valid = startsWithBytes(view, [137, 80, 78, 71, 13, 10, 26, 10]);
  } else if (type === "image/jpeg") {
    valid = startsWithBytes(view, [255, 216, 255]);
  } else if (type === "image/gif") {
    const header = ascii(view, 0, 6);
    valid = header === "GIF87a" || header === "GIF89a";
  } else if (type === "image/webp") {
    valid = ascii(view, 0, 4) === "RIFF" && ascii(view, 8, 12) === "WEBP" && view.length >= 12;
  }
  if (!valid) {
    invalid("image_content_invalid", "The uploaded file is not a valid image.", 415);
  }
  return view;
}
__name(validateImageBytes, "validateImageBytes");
function buildImageObjectPath({
  kind,
  ownerUid,
  restaurantId,
  extension,
  objectId
} = {}) {
  const normalizedKind = normalizeImageKind(kind);
  const uid = validateSafeSegment(ownerUid, "User uid");
  const id = String(objectId || "").toLowerCase();
  if (!UUID.test(id)) invalid("image_object_id_invalid", "The image object id is invalid.");
  const ext = String(extension || "").toLowerCase();
  if (!["png", "jpg", "webp", "gif"].includes(ext)) {
    invalid("image_extension_invalid", "The image extension is invalid.");
  }
  if (normalizedKind === IMAGE_KINDS.PRODUCT) {
    const restaurant = validateSafeSegment(restaurantId, "Restaurant id");
    return `products/${restaurant}/${id}.${ext}`;
  }
  if (normalizedKind === IMAGE_KINDS.RESTAURANT_LOGO) {
    const restaurant = validateSafeSegment(restaurantId, "Restaurant id");
    return `branding/${restaurant}/logo/${id}.${ext}`;
  }
  if (normalizedKind === IMAGE_KINDS.RESTAURANT_COVER) {
    const restaurant = validateSafeSegment(restaurantId, "Restaurant id");
    return `branding/${restaurant}/cover/${id}.${ext}`;
  }
  if (normalizedKind === IMAGE_KINDS.CATEGORY) {
    const restaurant = validateSafeSegment(restaurantId, "Restaurant id");
    return `categories/${restaurant}/${id}.${ext}`;
  }
  if (normalizedKind === IMAGE_KINDS.CUSTOMER_PROFILE) {
    return `users/${uid}/profile/${id}.${ext}`;
  }
  invalid("image_kind_invalid", "The image kind is invalid.");
}
__name(buildImageObjectPath, "buildImageObjectPath");
function parseProfileObjectPath(path) {
  const value = String(path || "");
  const match = value.match(
    /^users\/([A-Za-z0-9_-]{1,128})\/profile\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp|gif))$/i
  );
  if (!match) invalid("image_path_invalid", "The image path is invalid.");
  return { uid: match[1], path: value, extension: match[3].toLowerCase() };
}
__name(parseProfileObjectPath, "parseProfileObjectPath");
function parsePublicObjectPath(kind, path, restaurantId) {
  const normalizedKind = normalizeImageKind(kind);
  if (!isPublicImageKind(normalizedKind)) {
    invalid("image_path_invalid", "The image path is invalid.");
  }
  const restaurant = validateSafeSegment(restaurantId, "Restaurant id");
  const value = String(path || "");
  const patterns = {
    [IMAGE_KINDS.PRODUCT]: new RegExp(
      `^products/${restaurant}/${OBJECT_FILE}$`,
      "i"
    ),
    [IMAGE_KINDS.RESTAURANT_LOGO]: new RegExp(
      `^branding/${restaurant}/logo/${OBJECT_FILE}$`,
      "i"
    ),
    [IMAGE_KINDS.RESTAURANT_COVER]: new RegExp(
      `^branding/${restaurant}/cover/${OBJECT_FILE}$`,
      "i"
    ),
    [IMAGE_KINDS.CATEGORY]: new RegExp(
      `^categories/${restaurant}/${OBJECT_FILE}$`,
      "i"
    )
  };
  if (!patterns[normalizedKind].test(value)) {
    invalid("image_path_invalid", "The image path is invalid.");
  }
  return { path: value, restaurantId: restaurant };
}
__name(parsePublicObjectPath, "parsePublicObjectPath");

// src/imageApi.js
var MAX_JSON_BYTES = 16 * 1024;
var ImageRequestError = class extends Error {
  static {
    __name(this, "ImageRequestError");
  }
  constructor(code, message2, status = 400) {
    super(message2);
    this.name = "ImageRequestError";
    this.code = code;
    this.status = status;
  }
};
async function readJsonBody(request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_JSON_BYTES) {
    throw new ImageRequestError(
      "image_request_too_large",
      "The image request is too large.",
      413
    );
  }
  if (!raw) return {};
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ImageRequestError(
      "image_request_invalid",
      "The image request could not be processed."
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ImageRequestError(
      "image_request_invalid",
      "The image request could not be processed."
    );
  }
  return value;
}
__name(readJsonBody, "readJsonBody");
function referenceMatchesPath(reference, path, storage) {
  const current = String(reference || "").trim();
  if (!current) return false;
  if (current === path) return true;
  try {
    return current === storage.publicUrl(STORAGE_BUCKETS.RESTAURANT_ASSETS, path);
  } catch {
    return false;
  }
}
__name(referenceMatchesPath, "referenceMatchesPath");
function requireString(value, code, message2) {
  const text = String(value || "").trim();
  if (!text) throw new ImageRequestError(code, message2);
  return text;
}
__name(requireString, "requireString");
function createImageApi({
  db,
  storage,
  randomUUID = /* @__PURE__ */ __name(() => crypto.randomUUID(), "randomUUID"),
  now = /* @__PURE__ */ __name(() => Date.now(), "now")
} = {}) {
  if (!db) throw new Error("createImageApi requires a Firestore adapter.");
  if (!storage) throw new Error("createImageApi requires a Supabase storage adapter.");
  async function bestEffortCleanup(bucket, path) {
    try {
      await storage.remove(bucket, path);
    } catch {
    }
  }
  __name(bestEffortCleanup, "bestEffortCleanup");
  async function upload({ request, auth }) {
    const metadata = validateUploadMetadata({
      kind: request.headers.get("X-Image-Kind"),
      restaurantId: request.headers.get("X-Restaurant-Id"),
      originalFilename: request.headers.get("X-Original-Filename"),
      contentType: request.headers.get("Content-Type"),
      contentLength: request.headers.get("Content-Length")
    });
    if (metadata.kind === IMAGE_KINDS.CUSTOMER_PROFILE) {
      await requireRegisteredProfile(db, auth.uid);
    } else {
      await requireRestaurantManager(db, auth.uid, metadata.restaurantId);
    }
    let body;
    try {
      body = await request.arrayBuffer();
    } catch {
      throw new ImageRequestError(
        "image_body_unreadable",
        "The uploaded image could not be read."
      );
    }
    const bytes = validateImageBytes(body, metadata.contentType);
    const path = buildImageObjectPath({
      kind: metadata.kind,
      ownerUid: auth.uid,
      restaurantId: metadata.restaurantId,
      extension: metadata.extension,
      objectId: randomUUID()
    });
    const bucket = getStorageBucket(metadata.kind);
    try {
      await storage.upload(bucket, path, bytes, metadata.contentType);
    } catch (error) {
      if (error instanceof UpstreamUnavailableError && error.cleanupMayHaveSucceeded) {
        await bestEffortCleanup(bucket, path);
      }
      throw error;
    }
    if (metadata.kind === IMAGE_KINDS.CUSTOMER_PROFILE) {
      return {
        success: true,
        bucket,
        objectPath: path,
        reference: path,
        url: null,
        contentType: metadata.contentType
      };
    }
    const url = storage.publicUrl(bucket, path);
    return {
      success: true,
      bucket,
      objectPath: path,
      reference: url,
      url,
      contentType: metadata.contentType
    };
  }
  __name(upload, "upload");
  async function signedUrl({ request, auth }) {
    const body = await readJsonBody(request);
    const parsed = parseProfileObjectPath(
      requireString(
        body.path,
        "image_path_missing",
        "The profile image path is required."
      )
    );
    if (parsed.uid !== auth.uid) {
      throw new ImageAuthorizationError(
        "image_profile_forbidden",
        "You are not authorized to access this profile image."
      );
    }
    await requireRegisteredProfile(db, auth.uid);
    const expiresIn = SIGNED_URL_TTL_SECONDS;
    const url = await storage.createSignedUrl(
      STORAGE_BUCKETS.PROFILE_IMAGES,
      parsed.path,
      expiresIn
    );
    return {
      success: true,
      path: parsed.path,
      url,
      expiresAt: new Date(now() + expiresIn * 1e3).toISOString()
    };
  }
  __name(signedUrl, "signedUrl");
  async function assertPublicTargetNotCurrent({
    kind,
    path,
    restaurantId,
    resourceId
  }) {
    let field = null;
    let documentPath = null;
    let document = null;
    if (kind === IMAGE_KINDS.PRODUCT) {
      field = "image";
      documentPath = `products/${resourceId}`;
      document = await getDocumentData(db, documentPath);
      if (document && document.restaurantId && document.restaurantId !== restaurantId) {
        throw new ImageAuthorizationError(
          "image_resource_forbidden",
          "The image resource belongs to another restaurant."
        );
      }
    } else if (kind === IMAGE_KINDS.RESTAURANT_LOGO || kind === IMAGE_KINDS.RESTAURANT_COVER) {
      field = kind === IMAGE_KINDS.RESTAURANT_LOGO ? "logo" : "coverImage";
      documentPath = `restaurants/${restaurantId}`;
      document = await getDocumentData(db, documentPath);
    } else if (kind === IMAGE_KINDS.CATEGORY) {
      field = "image";
      documentPath = `restaurants/${restaurantId}/categories/${resourceId}`;
      document = await getDocumentData(db, documentPath);
      if (document && document.restaurantId && document.restaurantId !== restaurantId) {
        throw new ImageAuthorizationError(
          "image_resource_forbidden",
          "The image resource belongs to another restaurant."
        );
      }
    }
    if (document && referenceMatchesPath(document[field], path, storage)) {
      throw new ImageRequestError(
        "image_reference_in_use",
        "The image is still the current reference and cannot be deleted.",
        409
      );
    }
  }
  __name(assertPublicTargetNotCurrent, "assertPublicTargetNotCurrent");
  async function assertProfileTargetNotCurrent({ uid, path }) {
    const profile = await getDocumentData(db, `users/${uid}`);
    if (!profile) return;
    if (referenceMatchesPath(profile.photoPath, path, storage)) {
      throw new ImageRequestError(
        "image_reference_in_use",
        "The image is still the current reference and cannot be deleted.",
        409
      );
    }
  }
  __name(assertProfileTargetNotCurrent, "assertProfileTargetNotCurrent");
  async function remove({ request, auth }) {
    const body = await readJsonBody(request);
    const kind = requireString(
      body.kind,
      "image_kind_missing",
      "The image kind is required."
    );
    const path = requireString(
      body.path,
      "image_path_missing",
      "The image path is required."
    );
    const reason = requireString(
      body.reason,
      "image_delete_reason_missing",
      "The image deletion reason is required."
    );
    if (kind === IMAGE_KINDS.CUSTOMER_PROFILE) {
      const parsed2 = parseProfileObjectPath(path);
      if (parsed2.uid !== auth.uid) {
        throw new ImageAuthorizationError(
          "image_profile_forbidden",
          "You are not authorized to delete this profile image."
        );
      }
      await requireRegisteredProfile(db, auth.uid);
      if (!["profile-replace", "profile-remove", "account-delete"].includes(reason)) {
        throw new ImageRequestError(
          "image_delete_reason_invalid",
          "The profile image deletion reason is invalid."
        );
      }
      await assertProfileTargetNotCurrent({ uid: auth.uid, path: parsed2.path });
      const deleted2 = await storage.remove(STORAGE_BUCKETS.PROFILE_IMAGES, parsed2.path);
      return { success: true, deleted: Boolean(deleted2), path: parsed2.path };
    }
    if (!isPublicImageKind(kind)) {
      throw new ImageRequestError("image_kind_invalid", "The image kind is invalid.");
    }
    const restaurantId = requireString(
      body.restaurantId,
      "image_restaurant_missing",
      "The restaurant id is required."
    );
    const resourceId = validateSafeSegment(
      requireString(
        body.resourceId,
        "image_resource_missing",
        "The image resource id is required."
      ),
      "Resource id"
    );
    if (!["orphan-cleanup", "resource-delete"].includes(reason)) {
      throw new ImageRequestError(
        "image_delete_reason_invalid",
        "Public image deletion requires an explicit cleanup reason."
      );
    }
    const parsed = parsePublicObjectPath(kind, path, restaurantId);
    await requireRestaurantManager(db, auth.uid, restaurantId);
    await assertPublicTargetNotCurrent({
      kind,
      path: parsed.path,
      restaurantId,
      resourceId
    });
    const deleted = await storage.remove(
      STORAGE_BUCKETS.RESTAURANT_ASSETS,
      parsed.path
    );
    return { success: true, deleted: Boolean(deleted), path: parsed.path };
  }
  __name(remove, "remove");
  return { upload, signedUrl, remove };
}
__name(createImageApi, "createImageApi");

// src/app.js
var API_VERSION = "2.6.0";
var MAX_BODY_BYTES = 100 * 1024;
function json(status, headers, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
__name(json, "json");
function createWorkerApp({
  orderService,
  verifyToken,
  imageService = null,
  allowedOrigins,
  mode = "demo",
  projectId = null,
  now = /* @__PURE__ */ __name(() => /* @__PURE__ */ new Date(), "now"),
  logError = /* @__PURE__ */ __name((err) => console.error("[api]", safeErrorMessage(err)), "logError"),
  getServiceStatus = /* @__PURE__ */ __name(() => ({ firebase: { state: "unknown" } }), "getServiceStatus")
} = {}) {
  if (!orderService || typeof orderService.createOrder !== "function") {
    throw new Error("createWorkerApp requires an orderService with createOrder/getGuestOrder.");
  }
  if (typeof verifyToken !== "function") {
    throw new Error("createWorkerApp requires a verifyToken function.");
  }
  const allowed = parseAllowedOrigins(allowedOrigins);
  async function authenticateImageRequest(request) {
    const token = bearerToken(request.headers.get("Authorization"));
    if (!token) {
      return {
        error: {
          status: 401,
          body: {
            success: false,
            code: "image_unauthenticated",
            error: "You must be signed in to manage images."
          }
        }
      };
    }
    let decoded;
    try {
      decoded = await verifyToken(token);
    } catch (err) {
      if (isConfigurationError(err) || isUpstreamUnavailable(err)) throw err;
      return {
        error: {
          status: 401,
          body: {
            success: false,
            code: "image_unauthenticated",
            error: "Your session is invalid or has expired. Please sign in again."
          }
        }
      };
    }
    if (!decoded || !decoded.sub) {
      return {
        error: {
          status: 401,
          body: {
            success: false,
            code: "image_unauthenticated",
            error: "Your session is invalid or has expired. Please sign in again."
          }
        }
      };
    }
    const provider = decoded.firebase && decoded.firebase.sign_in_provider ? decoded.firebase.sign_in_provider : "";
    if (provider === "anonymous") {
      return {
        error: {
          status: 403,
          body: {
            success: false,
            code: "image_anonymous_forbidden",
            error: "Guest sessions cannot manage images."
          }
        }
      };
    }
    return { auth: { uid: decoded.sub, token: decoded } };
  }
  __name(authenticateImageRequest, "authenticateImageRequest");
  async function handleImageRequest(request, corsHeaders) {
    if (!imageService) {
      return json(
        503,
        corsHeaders,
        {
          success: false,
          error: "The image service is temporarily unavailable. Please try again."
        }
      );
    }
    const authResult = await authenticateImageRequest(request);
    if (authResult.error) {
      return json(authResult.error.status, corsHeaders, authResult.error.body);
    }
    const url = new URL(request.url);
    try {
      let result;
      if (request.method === "POST" && url.pathname === "/api/images/upload") {
        result = await imageService.upload({ request, auth: authResult.auth });
      } else if (request.method === "POST" && url.pathname === "/api/images/profile/signed-url") {
        result = await imageService.signedUrl({ request, auth: authResult.auth });
      } else if (request.method === "DELETE" && url.pathname === "/api/images") {
        result = await imageService.remove({ request, auth: authResult.auth });
      } else {
        return json(404, corsHeaders, { success: false, error: "Not found." });
      }
      return json(200, corsHeaders, result);
    } catch (err) {
      if (err instanceof ImageRequestError || err instanceof ImageValidationError || err instanceof ImageAuthorizationError || err instanceof StorageConflictError) {
        return json(err.status, corsHeaders, {
          success: false,
          code: err.code,
          error: err.message
        });
      }
      if (isConfigurationError(err) || isUpstreamUnavailable(err)) {
        logError(err);
        return json(
          503,
          corsHeaders,
          {
            success: false,
            error: "The image service is temporarily unavailable. Please try again."
          }
        );
      }
      logError(err);
      return json(
        500,
        corsHeaders,
        {
          success: false,
          error: "The image server encountered an error."
        }
      );
    }
  }
  __name(handleImageRequest, "handleImageRequest");
  return /* @__PURE__ */ __name(async function handleRequest(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    let corsHeaders = {};
    if (origin) {
      if (!isOriginAllowed(origin, allowed)) {
        return json(403, {}, { success: false, error: "Origin not allowed." });
      }
      corsHeaders = corsHeadersFor(origin);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        const status = readServiceStatus(getServiceStatus);
        return json(
          200,
          corsHeaders,
          {
            status: Object.values(status).some((entry) => entry.state === "error") ? "degraded" : "ok",
            service: "pizza-demo-api",
            mode,
            dependencies: status,
            time: now().toISOString()
          }
        );
      }
      if (request.method === "GET" && url.pathname === "/api/diagnostics") {
        const status = readServiceStatus(getServiceStatus);
        return json(
          200,
          corsHeaders,
          {
            status: Object.values(status).some((entry) => entry.state === "error") ? "degraded" : "ok",
            service: "pizza-demo-api",
            apiVersion: API_VERSION,
            mode,
            transport: "http-api",
            runtime: "cloudflare-workers",
            projectId: projectId || null,
            features: {
              createOrder: true,
              guestLookup: true,
              payment: ["cash"],
              images: {
                upload: true,
                signedProfileUrl: true,
                conservativeDelete: true
              }
            },
            dependencies: status,
            time: now().toISOString()
          }
        );
      }
      if (url.pathname.startsWith("/api/images/") || url.pathname === "/api/images") {
        return await handleImageRequest(request, corsHeaders);
      }
      if (request.method === "POST" && url.pathname === "/api/orders/create") {
        const token = bearerToken(request.headers.get("Authorization"));
        if (!token) {
          return json(
            401,
            corsHeaders,
            { success: false, error: "You must be signed in to place an order." }
          );
        }
        let decoded;
        try {
          decoded = await verifyToken(token);
        } catch (err) {
          if (isConfigurationError(err) || isUpstreamUnavailable(err)) throw err;
          return json(
            401,
            corsHeaders,
            { success: false, error: "Your session is invalid or has expired. Please sign in again." }
          );
        }
        if (!decoded || !decoded.sub) {
          return json(
            401,
            corsHeaders,
            { success: false, error: "Your session is invalid or has expired. Please sign in again." }
          );
        }
        const body = await readJsonBody2(request);
        if (body.error) {
          return json(body.status, corsHeaders, body.payload);
        }
        const auth = { uid: decoded.sub, token: decoded };
        const result = await orderService.createOrder({ data: body.value || {}, auth });
        return json(200, corsHeaders, result);
      }
      if (request.method === "POST" && url.pathname === "/api/orders/guest-lookup") {
        const body = await readJsonBody2(request);
        if (body.error) {
          return json(body.status, corsHeaders, body.payload);
        }
        const result = await orderService.getGuestOrder({ data: body.value || {} });
        return json(200, corsHeaders, result);
      }
      return json(404, corsHeaders, { success: false, error: "Not found." });
    } catch (err) {
      logError(err);
      if (isConfigurationError(err) || isUpstreamUnavailable(err)) {
        return json(503, corsHeaders, {
          success: false,
          error: "The order service is temporarily unavailable. Please try again."
        });
      }
      return json(500, corsHeaders, {
        success: false,
        error: "The order server encountered an error."
      });
    }
  }, "handleRequest");
}
__name(createWorkerApp, "createWorkerApp");
function readServiceStatus(getServiceStatus) {
  let raw;
  try {
    raw = getServiceStatus();
  } catch {
    raw = null;
  }
  const status = {};
  for (const dependency of ["firebase", "supabase"]) {
    const source = raw && raw[dependency] ? raw[dependency] : {};
    const state = ["ready", "configured", "not_initialized", "error"].includes(source.state) ? source.state : "unknown";
    status[dependency] = { state };
    if (state === "error" && typeof source.code === "string" && source.code) {
      status[dependency].code = source.code;
    }
  }
  return status;
}
__name(readServiceStatus, "readServiceStatus");
async function readJsonBody2(request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) {
    return {
      error: true,
      status: 413,
      payload: { success: false, error: "The request could not be processed." }
    };
  }
  if (!raw) return { value: {} };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        error: true,
        status: 400,
        payload: { success: false, error: "The request could not be processed." }
      };
    }
    return { value };
  } catch {
    return {
      error: true,
      status: 400,
      payload: { success: false, error: "The request could not be processed." }
    };
  }
}
__name(readJsonBody2, "readJsonBody");

// src/index.js
var import_orderServiceCore = __toESM(require_orderServiceCore(), 1);

// node_modules/jose/dist/webapi/lib/buffer_utils.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var strictDecoder = new TextDecoder("utf-8", { fatal: true });
var UINT32_RANGE = 2 ** 32;
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0), buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers)
    buf.set(buffer, i), i += buffer.length;
  return buf;
}
__name(concat, "concat");
var NON_ASCII = /[^\x00-\x7f]/;
function encode(string) {
  if (typeof string == "string" && string.length >= 128) {
    if (NON_ASCII.test(string))
      throw new TypeError("non-ASCII string encountered in encode()");
    return encoder.encode(string);
  }
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code > 127)
      throw new TypeError("non-ASCII string encountered in encode()");
    bytes[i] = code;
  }
  return bytes;
}
__name(encode, "encode");
function decodeBase64(encoded, url = false) {
  if (Uint8Array.fromBase64)
    return Uint8Array.fromBase64(encoded, { alphabet: url ? "base64url" : "base64" });
  if (url) {
    if (encoded.includes("+") || encoded.includes("/"))
      throw new TypeError("Invalid base64url");
    encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  }
  const binary = atob(encoded), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i);
  return bytes;
}
__name(decodeBase64, "decodeBase64");

// node_modules/jose/dist/webapi/util/errors.js
var JOSEError = class extends Error {
  static {
    __name(this, "JOSEError");
  }
  static code = "ERR_JOSE_GENERIC";
  code = "ERR_JOSE_GENERIC";
  constructor(message2, options) {
    super(message2, options), this.name = this.constructor.name, Error.captureStackTrace?.(this, this.constructor);
  }
};
var JWTClaimValidationFailed = class extends JOSEError {
  static {
    __name(this, "JWTClaimValidationFailed");
  }
  static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } }), this.claim = claim, this.reason = reason, this.payload = payload;
  }
};
var JWTExpired = class extends JOSEError {
  static {
    __name(this, "JWTExpired");
  }
  static code = "ERR_JWT_EXPIRED";
  code = "ERR_JWT_EXPIRED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } }), this.claim = claim, this.reason = reason, this.payload = payload;
  }
};
var JOSEAlgNotAllowed = class extends JOSEError {
  static {
    __name(this, "JOSEAlgNotAllowed");
  }
  static code = "ERR_JOSE_ALG_NOT_ALLOWED";
  code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported = class extends JOSEError {
  static {
    __name(this, "JOSENotSupported");
  }
  static code = "ERR_JOSE_NOT_SUPPORTED";
  code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWSInvalid = class extends JOSEError {
  static {
    __name(this, "JWSInvalid");
  }
  static code = "ERR_JWS_INVALID";
  code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
  static {
    __name(this, "JWTInvalid");
  }
  static code = "ERR_JWT_INVALID";
  code = "ERR_JWT_INVALID";
};
var JWKSInvalid = class extends JOSEError {
  static {
    __name(this, "JWKSInvalid");
  }
  static code = "ERR_JWKS_INVALID";
  code = "ERR_JWKS_INVALID";
};
var JWKSNoMatchingKey = class extends JOSEError {
  static {
    __name(this, "JWKSNoMatchingKey");
  }
  static code = "ERR_JWKS_NO_MATCHING_KEY";
  code = "ERR_JWKS_NO_MATCHING_KEY";
  constructor(message2 = "no applicable key found in the JSON Web Key Set", options) {
    super(message2, options);
  }
};
var JWKSMultipleMatchingKeys = class extends JOSEError {
  static {
    __name(this, "JWKSMultipleMatchingKeys");
  }
  [Symbol.asyncIterator] = async function* () {
  };
  static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  constructor(message2 = "multiple matching keys found in the JSON Web Key Set", options) {
    super(message2, options);
  }
};
var JWKSTimeout = class extends JOSEError {
  static {
    __name(this, "JWKSTimeout");
  }
  static code = "ERR_JWKS_TIMEOUT";
  code = "ERR_JWKS_TIMEOUT";
  constructor(message2 = "request timed out", options) {
    super(message2, options);
  }
};
var JWSSignatureVerificationFailed = class extends JOSEError {
  static {
    __name(this, "JWSSignatureVerificationFailed");
  }
  static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  constructor(message2 = "signature verification failed", options) {
    super(message2, options);
  }
};

// node_modules/jose/dist/webapi/util/base64url.js
var invalid2 = "The input to be decoded is not correctly encoded.";
function decode(input) {
  try {
    return decodeBase64(typeof input == "string" ? input : decoder.decode(input), true);
  } catch (cause) {
    throw new TypeError(invalid2, { cause });
  }
}
__name(decode, "decode");

// node_modules/jose/dist/webapi/lib/validate.js
function isObject(input) {
  if (typeof input != "object" || input === null || Object.prototype.toString.call(input) !== "[object Object]")
    return false;
  const prototype = Object.getPrototypeOf(input);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}
__name(isObject, "isObject");
function isJwkSet(input) {
  return isObject(input) && Array.isArray(input.keys) && Array.from(input.keys).every(isObject);
}
__name(isJwkSet, "isJwkSet");
function isDisjoint(...headers) {
  const parameters = /* @__PURE__ */ new Set();
  for (const header of headers)
    if (header)
      for (const parameter of Object.keys(header)) {
        if (parameters.has(parameter))
          return false;
        parameters.add(parameter);
      }
  return true;
}
__name(isDisjoint, "isDisjoint");
function decodeBase64url(value, label, ErrorClass) {
  try {
    return decode(value);
  } catch (cause) {
    throw new ErrorClass(`Failed to base64url decode the ${label}`, { cause });
  }
}
__name(decodeBase64url, "decodeBase64url");
function encodeAsciiMember(value, label, ErrorClass) {
  try {
    return encode(value);
  } catch (cause) {
    throw new ErrorClass(`The ${label} is not a valid base64url string`, { cause });
  }
}
__name(encodeAsciiMember, "encodeAsciiMember");
function parseJoseHeader(encodedProtectedHeader, ErrorClass, message2) {
  let parsed;
  try {
    parsed = JSON.parse(strictDecoder.decode(decode(encodedProtectedHeader)));
  } catch (cause) {
    throw new ErrorClass(message2, { cause });
  }
  if (!isObject(parsed))
    throw new ErrorClass(message2);
  return parsed;
}
__name(parseJoseHeader, "parseJoseHeader");
var JWS_RECOGNIZED = { __proto__: null, b64: true };
function validateAlgorithms(option, algorithms) {
  if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s != "string")))
    throw new TypeError(`"${option}" option must be an array of strings`);
  return algorithms === void 0 ? void 0 : new Set(algorithms);
}
__name(validateAlgorithms, "validateAlgorithms");
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0)
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  if (!protectedHeader || protectedHeader.crit === void 0)
    return [];
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input != "string" || input.length === 0))
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  const recognized = recognizedOption === void 0 ? recognizedDefault : { __proto__: null, ...recognizedOption, ...recognizedDefault };
  for (const parameter of protectedHeader.crit) {
    if (!(parameter in recognized))
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    if (!Object.hasOwn(joseHeader, parameter) || joseHeader[parameter] === void 0)
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    if (recognized[parameter] && (!Object.hasOwn(protectedHeader, parameter) || protectedHeader[parameter] === void 0))
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
  }
  return protectedHeader.crit;
}
__name(validateCrit, "validateCrit");
function validateB64(protectedHeader, extensions) {
  if (extensions.includes("b64")) {
    const b64 = protectedHeader.b64;
    if (typeof b64 != "boolean")
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    return b64;
  }
  return true;
}
__name(validateB64, "validateB64");

// node_modules/jose/dist/webapi/lib/key.js
var tag = /* @__PURE__ */ __name((key) => key[Symbol.toStringTag], "tag");
var jwkMatchesOp = /* @__PURE__ */ __name((entry, key, usage) => {
  const { alg } = entry;
  if (key.use !== void 0) {
    const expected = usage === "sign" || usage === "verify" ? "sig" : "enc";
    if (key.use !== expected)
      throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
  }
  if (key.alg !== void 0 && key.alg !== alg)
    throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
  if (Array.isArray(key.key_ops)) {
    const expectedKeyOp = usage === "encrypt" || usage === "decrypt" ? entry.ops?.[usage === "encrypt" ? 0 : 1] : usage;
    if (expectedKeyOp && !key.key_ops.includes(expectedKeyOp))
      throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
  }
}, "jwkMatchesOp");
async function prepareKey(entry, key, usage) {
  const { alg, secret } = entry, requiresPrivateKey = usage === "decrypt" || usage === "sign";
  if (secret && key instanceof Uint8Array)
    return key;
  let normalized, keyObject;
  if (isObject(key)) {
    if (normalized = normalizeJwk(key), typeof normalized.kty != "string")
      throw invalidKeyType(alg, key, secret);
    if (!(secret ? normalized.kty === "oct" && typeof normalized.k == "string" : normalized.kty !== "oct" && (requiresPrivateKey ? normalized.kty === "AKP" && typeof normalized.priv == "string" || typeof normalized.d == "string" : normalized.d === void 0 && normalized.priv === void 0)))
      throw new TypeError(secret ? 'JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present' : `JSON Web Key for this operation must be a ${requiresPrivateKey ? "private" : "public"} JWK`);
    if (jwkMatchesOp(entry, normalized, usage), normalized.kty === "oct")
      return decode(normalized.k);
    if (!Object.isFrozen(key)) {
      const { key_ops } = key;
      Array.isArray(key_ops) && Object.freeze(key_ops), Object.freeze(key);
    }
  } else {
    if (!isKeyLike(key))
      throw invalidKeyType(alg, key, secret);
    const expectedType = secret ? "secret" : requiresPrivateKey ? "private" : "public";
    if (key.type !== expectedType && (secret || ["secret", "public", "private"].includes(key.type)))
      throw new TypeError(`${tag(key)} instances must be of type "${expectedType}" for the ${alg} algorithm`);
    if (isCryptoKey(key))
      return key;
    if (keyObject = key, keyObject.type === "secret")
      return keyObject.export();
  }
  cache ||= /* @__PURE__ */ new WeakMap();
  const cacheKey = key;
  let cached = cache.get(cacheKey);
  if (cached?.[alg])
    return cached[alg];
  if (cached || cache.set(cacheKey, cached = {}), keyObject && typeof keyObject.toCryptoKey == "function") {
    const isPublic = keyObject.type === "public", crv = nist[keyObject.asymmetricKeyDetails?.namedCurve], params = entry.resolve?.({ crv, asymmetricKeyType: keyObject.asymmetricKeyType }) ?? entry.subtle;
    return cached[alg] = keyObject.toCryptoKey(params, isPublic, entry.usages[isPublic ? 0 : 1]);
  }
  return normalized ??= keyObject.export({ format: "jwk" }), normalized.alg = alg, cached[alg] = await jwkToKey(entry, normalized);
}
__name(prepareKey, "prepareKey");
var cache;
var nist = {
  __proto__: null,
  prime256v1: "P-256",
  secp384r1: "P-384",
  secp521r1: "P-521"
};
var isCryptoKey = /* @__PURE__ */ __name((key) => {
  if (key?.[Symbol.toStringTag] === "CryptoKey")
    return true;
  try {
    return key instanceof CryptoKey;
  } catch {
    return false;
  }
}, "isCryptoKey");
var isKeyObject = /* @__PURE__ */ __name((key) => key?.[Symbol.toStringTag] === "KeyObject", "isKeyObject");
var isKeyLike = /* @__PURE__ */ __name((key) => isCryptoKey(key) || isKeyObject(key), "isKeyLike");
function message(msg, actual, ...types) {
  if (types.length > 2) {
    const last = types.pop();
    msg += `one of type ${types.join(", ")}, or ${last}.`;
  } else types.length === 2 ? msg += `one of type ${types[0]} or ${types[1]}.` : msg += `of type ${types[0]}.`;
  return actual == null ? msg += ` Received ${actual}` : typeof actual == "function" && actual.name ? msg += ` Received function ${actual.name}` : typeof actual == "object" && actual != null && actual.constructor?.name && (msg += ` Received an instance of ${actual.constructor.name}`), msg;
}
__name(message, "message");
function invalidKeyType(alg, actual, secret) {
  const types = ["CryptoKey", "KeyObject", "JSON Web Key"];
  return secret && types.push("Uint8Array"), new TypeError(message(`Key for the ${alg} algorithm must be `, actual, ...types));
}
__name(invalidKeyType, "invalidKeyType");
var unusable = /* @__PURE__ */ __name((name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`), "unusable");
function checkUsage(key, usage) {
  if (usage && !key.usages.includes(usage))
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
}
__name(checkUsage, "checkUsage");
function checkModulusLength(alg, key) {
  const { modulusLength } = key.algorithm;
  if (typeof modulusLength != "number" || modulusLength < 2048)
    throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
}
__name(checkModulusLength, "checkModulusLength");
function checkCryptoKey(key, expected, usage) {
  const algorithm = key.algorithm;
  if (algorithm.name !== expected.name)
    throw unusable(expected.name);
  if (expected.hash && algorithm.hash?.name !== expected.hash)
    throw unusable(expected.hash, "algorithm.hash");
  if (expected.namedCurve && algorithm.namedCurve !== expected.namedCurve)
    throw unusable(expected.namedCurve, "algorithm.namedCurve");
  if (expected.length !== void 0 && algorithm.length !== expected.length)
    throw unusable(expected.length, "algorithm.length");
  checkUsage(key, usage);
}
__name(checkCryptoKey, "checkCryptoKey");
function snapshotJwk(jwk) {
  return { __proto__: null, ...jwk };
}
__name(snapshotJwk, "snapshotJwk");
function normalizeJwk(jwk) {
  const normalized = snapshotJwk(jwk);
  if (normalized.ext !== void 0 && typeof normalized.ext != "boolean")
    throw new TypeError('"ext" (Extractable) Parameter must be a boolean');
  if (normalized.key_ops !== void 0) {
    const value = normalized.key_ops, keyOps = Array.isArray(value) ? [...value] : void 0;
    if (!keyOps || keyOps.some((operation) => typeof operation != "string") || new Set(keyOps).size !== keyOps.length)
      throw new TypeError('"key_ops" (Key Operations) Parameter must be an array of unique strings');
    normalized.key_ops = keyOps;
  }
  return normalized;
}
__name(normalizeJwk, "normalizeJwk");
async function jwkToKey(entry, jwk, extractable) {
  if (!entry.kty.includes(jwk.kty))
    throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
  const algorithm = entry.resolve?.({ kty: jwk.kty, crv: jwk.crv }) ?? entry.subtle, isPrivate = !!(jwk.d || jwk.priv), keyData = { ...jwk, ext: extractable ?? jwk.ext };
  return keyData.kty !== "AKP" && delete keyData.alg, delete keyData.use, crypto.subtle.importKey("jwk", keyData, algorithm, keyData.ext ?? !isPrivate, jwk.key_ops ?? entry.usages[isPrivate ? 1 : 0]);
}
__name(jwkToKey, "jwkToKey");
async function rawKey(key, expected, usage, extractable = false) {
  return key instanceof Uint8Array && (key = await crypto.subtle.importKey("raw", key, expected, extractable, [usage])), checkCryptoKey(key, expected, usage), key;
}
__name(rawKey, "rawKey");

// node_modules/jose/dist/webapi/lib/key_descriptor.js
function table(entries) {
  const out = { __proto__: null };
  for (const alg in entries)
    out[alg] = { ...entries[alg], alg };
  return out;
}
__name(table, "table");

// node_modules/jose/dist/webapi/lib/jws_algorithms.js
var sig = [["verify"], ["sign"]];
function hmac(bits) {
  const subtle = { name: "HMAC", hash: `SHA-${bits}` };
  return { kty: ["oct"], secret: true, subtle, signing: subtle, usages: sig };
}
__name(hmac, "hmac");
function rsa(bits, saltLength) {
  const subtle = { name: saltLength ? "RSA-PSS" : "RSASSA-PKCS1-v1_5", hash: `SHA-${bits}` };
  return {
    kty: ["RSA"],
    subtle,
    signing: saltLength ? { ...subtle, saltLength } : subtle,
    usages: sig,
    minRsaBits: 2048
  };
}
__name(rsa, "rsa");
function ecdsa(crv, bits) {
  return {
    kty: ["EC"],
    crv,
    subtle: { name: "ECDSA", namedCurve: crv },
    signing: { name: "ECDSA", hash: `SHA-${bits}` },
    usages: sig
  };
}
__name(ecdsa, "ecdsa");
function eddsa() {
  const subtle = { name: "Ed25519" };
  return {
    kty: ["OKP"],
    crv: "Ed25519",
    subtle,
    signing: subtle,
    usages: sig
  };
}
__name(eddsa, "eddsa");
function mldsa(parameterSet) {
  const subtle = { name: `ML-DSA-${parameterSet}` };
  return {
    kty: ["AKP"],
    subtle,
    signing: subtle,
    usages: sig
  };
}
__name(mldsa, "mldsa");
var JWS = table({
  HS256: hmac(256),
  HS384: hmac(384),
  HS512: hmac(512),
  RS256: rsa(256),
  RS384: rsa(384),
  RS512: rsa(512),
  PS256: rsa(256, 32),
  PS384: rsa(384, 48),
  PS512: rsa(512, 64),
  ES256: ecdsa("P-256", 256),
  ES384: ecdsa("P-384", 384),
  ES512: ecdsa("P-521", 512),
  EdDSA: eddsa(),
  Ed25519: eddsa(),
  "ML-DSA-44": mldsa(44),
  "ML-DSA-65": mldsa(65),
  "ML-DSA-87": mldsa(87)
});
function jwsAlgorithm(alg) {
  const entry = typeof alg == "string" ? JWS[alg] : void 0;
  if (!entry)
    throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  return entry;
}
__name(jwsAlgorithm, "jwsAlgorithm");

// node_modules/jose/dist/webapi/lib/jws_verify.js
function prepareVerify(options) {
  return [options && validateAlgorithms("algorithms", options.algorithms), options?.crit];
}
__name(prepareVerify, "prepareVerify");
function parseProtectedHeader(encodedProtectedHeader) {
  return encodedProtectedHeader === void 0 ? {} : parseJoseHeader(encodedProtectedHeader, JWSInvalid, "JWS Protected Header is invalid");
}
__name(parseProtectedHeader, "parseProtectedHeader");
function encodeCompactUnencodedPayload(payload) {
  try {
    return encode(payload);
  } catch (cause) {
    throw new JWSInvalid("JWS Compact Serialization payload must use only ASCII characters", {
      cause
    });
  }
}
__name(encodeCompactUnencodedPayload, "encodeCompactUnencodedPayload");
async function verifySignature(jws, shared, key, encodeUnencodedPayload, parsedProtected) {
  const { protected: encodedProtectedHeader, header, payload: inputPayload } = jws, protectedHeader = parsedProtected ?? parseProtectedHeader(encodedProtectedHeader);
  if (!isDisjoint(protectedHeader, header))
    throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  const joseHeader = { ...protectedHeader, ...header }, b64 = validateB64(protectedHeader, validateCrit(JWSInvalid, JWS_RECOGNIZED, shared[1], protectedHeader, joseHeader)), { alg } = joseHeader;
  if (typeof alg != "string" || !alg)
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  if (shared[0] && !shared[0].has(alg))
    throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed');
  if (b64) {
    if (typeof inputPayload != "string")
      throw new JWSInvalid("JWS Payload must be a string");
  } else if (typeof inputPayload != "string" && !(inputPayload instanceof Uint8Array))
    throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
  const signingPayload = b64 || typeof inputPayload != "string" ? inputPayload : encodeUnencodedPayload(inputPayload);
  let resolvedKey = false;
  typeof key == "function" && (key = await key(protectedHeader, jws), resolvedKey = true);
  const entry = jwsAlgorithm(alg), signingInput = concat(encodedProtectedHeader !== void 0 ? encode(encodedProtectedHeader) : new Uint8Array(), encode("."), typeof signingPayload == "string" ? shared[2] ??= encodeAsciiMember(signingPayload, "payload", JWSInvalid) : signingPayload), signature = decodeBase64url(jws.signature, "signature", JWSInvalid), verificationKey = await prepareKey(entry, key, "verify"), cryptoKey = await rawKey(verificationKey, entry.subtle, "verify");
  entry.minRsaBits && checkModulusLength(entry.alg, cryptoKey);
  let verified = false;
  try {
    verified = await crypto.subtle.verify(entry.signing, cryptoKey, signature, signingInput);
  } catch (cause) {
    throw new JWSSignatureVerificationFailed(void 0, { cause });
  }
  if (!verified)
    throw new JWSSignatureVerificationFailed();
  const result = { payload: typeof signingPayload == "string" ? decodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload };
  return encodedProtectedHeader !== void 0 && (result.protectedHeader = protectedHeader), header !== void 0 && (result.unprotectedHeader = header), resolvedKey ? [{ ...result, key: verificationKey }, b64] : [result, b64];
}
__name(verifySignature, "verifySignature");
async function verifyCompact(jws, shared, key) {
  if (jws instanceof Uint8Array && (jws = decoder.decode(jws)), typeof jws != "string")
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3)
    throw new JWSInvalid("Invalid Compact JWS");
  return verifySignature({ payload, protected: protectedHeader, signature }, shared, key, encodeCompactUnencodedPayload);
}
__name(verifyCompact, "verifyCompact");

// node_modules/jose/dist/webapi/lib/jwt_claims_set.js
var epoch = /* @__PURE__ */ __name((date) => Math.floor(date.getTime() / 1e3), "epoch");
var multipliers = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31557600
};
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var checkFailed = "check_failed";
function invalidDuration() {
  throw new TypeError("Invalid time period format");
}
__name(invalidDuration, "invalidDuration");
function secs(str) {
  typeof str != "string" && invalidDuration();
  const matched = REGEX.exec(str);
  (!matched || matched[4] && matched[1]) && invalidDuration();
  const value = parseFloat(matched[2]), durationSeconds = Math.round(value * multipliers[matched[3][0].toLowerCase()]);
  return Number.isFinite(durationSeconds) || invalidDuration(), matched[1] === "-" || matched[4] === "ago" ? -durationSeconds : durationSeconds;
}
__name(secs, "secs");
function validateInput(label, input) {
  if (!Number.isFinite(input))
    throw new TypeError(`Invalid ${label} input`);
  return input;
}
__name(validateInput, "validateInput");
var normalizeTyp = /* @__PURE__ */ __name((value) => {
  const normalized = value.toLowerCase();
  return value.includes("/") ? normalized : `application/${normalized}`;
}, "normalizeTyp");
var checkAudiencePresence = /* @__PURE__ */ __name((audPayload, audOption) => typeof audPayload == "string" ? audOption.includes(audPayload) : Array.isArray(audPayload) ? audOption.some((aud) => audPayload.includes(aud)) : false, "checkAudiencePresence");
function validateNumericDate(claimsSet, claim, required = false) {
  const value = claimsSet[claim];
  if (!(value === void 0 && !required)) {
    if (typeof value != "number")
      throw new JWTClaimValidationFailed(`"${claim}" claim must be a number`, claimsSet, claim, "invalid");
    return value;
  }
}
__name(validateNumericDate, "validateNumericDate");
function unexpectedClaim(claimsSet, claim) {
  throw new JWTClaimValidationFailed(`unexpected "${claim}" claim value`, claimsSet, claim, checkFailed);
}
__name(unexpectedClaim, "unexpectedClaim");
function validateClaimsSet(protectedHeader, claimsSetBytes, options = {}) {
  let claimsSet;
  try {
    claimsSet = JSON.parse(strictDecoder.decode(claimsSetBytes));
  } catch (cause) {
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object", { cause });
  }
  if (!isObject(claimsSet))
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
  const { typ } = options;
  if (typ !== void 0 && (typeof protectedHeader.typ != "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ)))
    throw new JWTClaimValidationFailed('unexpected "typ" JWT header value', claimsSet, "typ", checkFailed);
  const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options, presenceCheck = [...requiredClaims];
  maxTokenAge !== void 0 && presenceCheck.push("iat"), audience !== void 0 && presenceCheck.push("aud"), subject !== void 0 && presenceCheck.push("sub"), issuer !== void 0 && presenceCheck.push("iss");
  for (const claim of new Set(presenceCheck.reverse()))
    if (!Object.hasOwn(claimsSet, claim))
      throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, claimsSet, claim, "missing");
  issuer !== void 0 && !(Array.isArray(issuer) ? issuer : [issuer]).includes(claimsSet.iss) && unexpectedClaim(claimsSet, "iss"), subject !== void 0 && claimsSet.sub !== subject && unexpectedClaim(claimsSet, "sub"), audience !== void 0 && !checkAudiencePresence(claimsSet.aud, typeof audience == "string" ? [audience] : audience) && unexpectedClaim(claimsSet, "aud");
  const { clockTolerance } = options;
  let tolerance = 0;
  if (typeof clockTolerance == "string")
    tolerance = secs(clockTolerance);
  else if (clockTolerance !== void 0) {
    if (typeof clockTolerance != "number")
      throw new TypeError("Invalid clockTolerance option type");
    tolerance = clockTolerance;
  }
  validateInput("clockTolerance option", tolerance);
  const { currentDate } = options, now = validateInput("currentDate option", epoch(currentDate === void 0 ? /* @__PURE__ */ new Date() : currentDate)), iat = validateNumericDate(claimsSet, "iat", maxTokenAge !== void 0), nbf = validateNumericDate(claimsSet, "nbf");
  if (nbf !== void 0 && nbf > now + tolerance)
    throw new JWTClaimValidationFailed('"nbf" claim timestamp check failed', claimsSet, "nbf", checkFailed);
  const exp = validateNumericDate(claimsSet, "exp");
  if (exp !== void 0 && exp <= now - tolerance)
    throw new JWTExpired('"exp" claim timestamp check failed', claimsSet, "exp", checkFailed);
  if (maxTokenAge !== void 0) {
    const age = now - iat, max = validateInput("maxTokenAge option", typeof maxTokenAge == "number" ? maxTokenAge : secs(maxTokenAge));
    if (age - tolerance > max)
      throw new JWTExpired('"iat" claim timestamp check failed (too far in the past)', claimsSet, "iat", checkFailed);
    if (age < -tolerance)
      throw new JWTClaimValidationFailed('"iat" claim timestamp check failed (it should be in the past)', claimsSet, "iat", checkFailed);
  }
  return claimsSet;
}
__name(validateClaimsSet, "validateClaimsSet");

// node_modules/jose/dist/webapi/jwt/verify.js
async function jwtVerify(jwt, key, options) {
  const [verified, b64] = await verifyCompact(jwt, prepareVerify(options), key);
  if (!b64)
    throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
  const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
  return { ...verified, payload };
}
__name(jwtVerify, "jwtVerify");

// node_modules/jose/dist/webapi/jwks/local.js
function isUsableJWK(jwk, entry, alg, kid) {
  const { kty, key_ops: keyOps, ext, kid: jwkKid, alg: jwkAlg, use, crv } = jwk;
  return (ext === void 0 || typeof ext == "boolean") && (keyOps === void 0 || Array.isArray(keyOps) && keyOps.every((operation, index) => typeof operation == "string" && keyOps.indexOf(operation) === index) && keyOps.includes("verify")) && entry.kty.includes(kty) && (kid === void 0 || typeof kid == "string" && kid === jwkKid) && (jwkAlg === void 0 ? kty !== "AKP" : alg === jwkAlg) && (use === void 0 || use === "sig") && (!entry.crv || crv === entry.crv);
}
__name(isUsableJWK, "isUsableJWK");
async function importWithAlgCache(cache2, jwk, entry) {
  const cached = cache2.get(jwk) || cache2.set(jwk, {}).get(jwk), { alg } = entry;
  if (cached[alg] === void 0) {
    const pending = jwkToKey(entry, jwk, true).then((key) => {
      if (key.type !== "public")
        throw new JWKSInvalid("JSON Web Key Set members must be public keys");
      return cached[alg] = key, key;
    }).catch((error) => {
      throw cached[alg] === pending && delete cached[alg], error;
    });
    cached[alg] = pending;
  }
  return cached[alg];
}
__name(importWithAlgCache, "importWithAlgCache");
function createLocalJWKSet(jwks) {
  let snapshot;
  try {
    snapshot = structuredClone(jwks);
  } catch (cause) {
    throw new JWKSInvalid("JSON Web Key Set malformed", { cause });
  }
  if (!isJwkSet(snapshot))
    throw new JWKSInvalid("JSON Web Key Set malformed");
  const metadata = snapshot.keys.map((jwk) => {
    const normalized = snapshotJwk(jwk);
    return Array.isArray(normalized.key_ops) && (normalized.key_ops = [...normalized.key_ops]), normalized;
  }), cached = /* @__PURE__ */ new WeakMap();
  return Object.defineProperty(async (protectedHeader, token) => {
    const { alg, kid } = { ...protectedHeader, ...token?.header }, entry = typeof alg == "string" ? JWS[alg] : void 0;
    if (!entry || entry.secret)
      throw new JOSENotSupported('Unsupported "alg" value for a JSON Web Key Set');
    const candidates = snapshot.keys.filter((_, index) => isUsableJWK(metadata[index], entry, alg, kid)), { 0: jwk, length } = candidates;
    if (!length)
      throw new JWKSNoMatchingKey();
    if (length !== 1) {
      const error = new JWKSMultipleMatchingKeys();
      throw error[Symbol.asyncIterator] = async function* () {
        for (const jwk2 of candidates)
          try {
            yield await importWithAlgCache(cached, jwk2, entry);
          } catch {
          }
      }, error;
    }
    return importWithAlgCache(cached, jwk, entry);
  }, "jwks", {
    value: /* @__PURE__ */ __name(() => structuredClone(snapshot), "value")
  });
}
__name(createLocalJWKSet, "createLocalJWKSet");

// node_modules/jose/dist/webapi/jwks/remote.js
function isCloudflareWorkers() {
  return typeof WebSocketPair < "u" || typeof navigator < "u" && true || typeof EdgeRuntime < "u" && EdgeRuntime === "vercel";
}
__name(isCloudflareWorkers, "isCloudflareWorkers");
var USER_AGENT;
(typeof navigator > "u" || !"Cloudflare-Workers"?.startsWith?.("Mozilla/5.0 ")) && (USER_AGENT = "jose/v6.2.13");
var customFetch = /* @__PURE__ */ Symbol();
async function fetchJwks(url, headers, signal, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: "GET",
    signal,
    redirect: "manual",
    headers
  }).catch((err) => {
    throw err.name === "TimeoutError" ? new JWKSTimeout(void 0, { cause: err }) : err;
  });
  if (response.status !== 200)
    throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
  try {
    return await response.json();
  } catch (cause) {
    throw new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON", { cause });
  }
}
__name(fetchJwks, "fetchJwks");
var jwksCache = /* @__PURE__ */ Symbol();
function isFreshFor(timestamp, duration) {
  return Number.isFinite(timestamp) && Date.now() < timestamp + duration;
}
__name(isFreshFor, "isFreshFor");
function validateDuration(value, fallback, option) {
  if (Number.isNaN(value))
    throw new TypeError(`"${option}" option must not be NaN`);
  return typeof value == "number" ? value : fallback;
}
__name(validateDuration, "validateDuration");
function createRemoteJWKSet(url, options) {
  if (!(url instanceof URL))
    throw new TypeError("url must be an instance of URL");
  const href = new URL(url.href).href, opts = options ?? {}, timeoutOption = opts.timeoutDuration;
  if (typeof timeoutOption == "number" && (!Number.isInteger(timeoutOption) || timeoutOption < 0))
    throw new TypeError('"timeoutDuration" option must be a non-negative integer');
  const timeoutDuration = typeof timeoutOption == "number" ? timeoutOption : 5e3, cooldownDuration = validateDuration(opts.cooldownDuration, 3e4, "cooldownDuration"), cacheMaxAge = validateDuration(opts.cacheMaxAge, 6e5, "cacheMaxAge"), headers = new Headers(opts.headers);
  USER_AGENT && !headers.has("User-Agent") && headers.set("User-Agent", USER_AGENT), headers.has("accept") || headers.set("accept", "application/json, application/jwk-set+json");
  const fetchImpl = opts[customFetch], cache2 = opts[jwksCache];
  let jwksTimestamp, pendingFetch, reloadSequence = 0, appliedSequence = 0, local;
  if (cache2 && typeof cache2 == "object") {
    const { uat, jwks } = cache2;
    isFreshFor(uat, cacheMaxAge) && isJwkSet(jwks) && (jwksTimestamp = uat, local = createLocalJWKSet(jwks));
  }
  const reload = /* @__PURE__ */ __name(async () => {
    if (pendingFetch && isCloudflareWorkers() && (pendingFetch = void 0), !pendingFetch) {
      const sequence = ++reloadSequence, current = pendingFetch = fetchJwks(href, headers, AbortSignal.timeout(timeoutDuration), fetchImpl).then((json2) => {
        const next = createLocalJWKSet(json2);
        if (sequence <= appliedSequence)
          return;
        local = next;
        const updatedAt = Date.now();
        cache2 && (cache2.uat = updatedAt, cache2.jwks = json2), jwksTimestamp = updatedAt, appliedSequence = sequence;
      }).finally(() => {
        pendingFetch === current && (pendingFetch = void 0);
      });
    }
    await pendingFetch;
  }, "reload");
  return Object.defineProperties(async (protectedHeader, token) => {
    (!local || !isFreshFor(jwksTimestamp, cacheMaxAge)) && await reload();
    try {
      return await local(protectedHeader, token);
    } catch (err) {
      if (err instanceof JWKSNoMatchingKey && !isFreshFor(jwksTimestamp, cooldownDuration))
        return await reload(), local(protectedHeader, token);
      throw err;
    }
  }, {
    coolingDown: {
      get: /* @__PURE__ */ __name(() => isFreshFor(jwksTimestamp, cooldownDuration), "get"),
      enumerable: true
    },
    fresh: {
      get: /* @__PURE__ */ __name(() => isFreshFor(jwksTimestamp, cacheMaxAge), "get"),
      enumerable: true
    },
    reload: {
      value: reload,
      enumerable: true
    },
    reloading: {
      get: /* @__PURE__ */ __name(() => !!pendingFetch, "get"),
      enumerable: true
    },
    jwks: {
      value: /* @__PURE__ */ __name(() => local?.jwks(), "value"),
      enumerable: true
    }
  });
}
__name(createRemoteJWKSet, "createRemoteJWKSet");

// src/firebaseAuth.js
var DEFAULT_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
var LOOKUP_URL_BASE = "https://identitytoolkit.googleapis.com/v1";
var SERVICE_ERROR_CODES = [
  "API_KEY_INVALID",
  "INSUFFICIENT_PERMISSION",
  "OPERATION_NOT_ALLOWED",
  "PERMISSION_DENIED",
  "UNAUTHENTICATED"
];
function defaultLogDiagnostic(entry) {
  console.warn("[firebase-auth]", JSON.stringify(entry));
}
__name(defaultLogDiagnostic, "defaultLogDiagnostic");
function sanitizeLookupErrorCode(body) {
  const error = body && typeof body === "object" && body.error ? body.error : null;
  const message2 = error && typeof error.message === "string" ? error.message : "";
  const status = error && typeof error.status === "string" ? error.status : "";
  if (/api[_ ]?key/i.test(message2)) return "API_KEY_INVALID";
  const head = message2.split(":")[0].trim().toUpperCase();
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(head) && head.length <= 40) {
    return head;
  }
  if (/^[A-Z][A-Z_]{2,40}$/.test(status)) return status;
  return "UNKNOWN";
}
__name(sanitizeLookupErrorCode, "sanitizeLookupErrorCode");
function isServiceFailure(status, code) {
  if (status === 401 || status === 403) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  if (SERVICE_ERROR_CODES.includes(code)) return true;
  return false;
}
__name(isServiceFailure, "isServiceFailure");
function createVerifyIdToken({
  projectId,
  apiKey = "",
  jwksUrl = DEFAULT_JWKS_URL,
  lookupUrlBase = LOOKUP_URL_BASE,
  fetchImpl = fetch,
  logDiagnostic = defaultLogDiagnostic
} = {}) {
  if (!projectId) throw new Error("createVerifyIdToken requires a projectId.");
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  async function assertUserExists(token) {
    const url = `${lookupUrlBase}/accounts:lookup?key=${encodeURIComponent(apiKey)}`;
    let lookup;
    try {
      lookup = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token })
      });
    } catch {
      logDiagnostic({
        stage: "accounts:lookup",
        outcome: "unreachable",
        code: "LOOKUP_UNREACHABLE"
      });
      throw new UpstreamUnavailableError("Identity Toolkit lookup could not be reached.");
    }
    const body = await lookup.json().catch(() => null);
    if (!lookup.ok) {
      const code = sanitizeLookupErrorCode(body);
      logDiagnostic({
        stage: "accounts:lookup",
        outcome: "rejected",
        status: lookup.status,
        code
      });
      if (isServiceFailure(lookup.status, code)) {
        throw new UpstreamUnavailableError(
          `Identity Toolkit lookup failed (${lookup.status}, ${code}).`
        );
      }
      throw new Error(`Token lookup failed (${lookup.status}, ${code}).`);
    }
    if (!body || !Array.isArray(body.users) || !body.users.length) {
      logDiagnostic({
        stage: "accounts:lookup",
        outcome: "no_user",
        status: lookup.status,
        code: "USER_NOT_FOUND"
      });
      throw new Error("Token lookup returned no user.");
    }
    logDiagnostic({
      stage: "accounts:lookup",
      outcome: "ok",
      status: lookup.status,
      code: "OK"
    });
  }
  __name(assertUserExists, "assertUserExists");
  return /* @__PURE__ */ __name(async function verifyIdToken(idToken) {
    const token = String(idToken || "").trim();
    if (!token) throw new Error("Missing ID token.");
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: 60
    });
    if (!payload.sub || typeof payload.sub !== "string") {
      throw new Error("Token has no subject (uid).");
    }
    if (apiKey) {
      await assertUserExists(token);
    }
    return payload;
  }, "verifyIdToken");
}
__name(createVerifyIdToken, "createVerifyIdToken");

// src/firestore.js
var SERVER_TIMESTAMP = /* @__PURE__ */ Symbol("serverTimestamp");
function serverTimestamp() {
  return { __serverTimestamp: SERVER_TIMESTAMP };
}
__name(serverTimestamp, "serverTimestamp");
function isServerTimestamp(value) {
  return Boolean(value) && typeof value === "object" && value.__serverTimestamp === SERVER_TIMESTAMP;
}
__name(isServerTimestamp, "isServerTimestamp");
function encodeValue(value) {
  if (value === void 0 || value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFields(value) } };
  }
  throw new Error(`Cannot encode value of type ${typeof value} for Firestore.`);
}
__name(encodeValue, "encodeValue");
function encodeFields(obj) {
  const fields = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] === void 0) continue;
    if (isServerTimestamp(obj[key])) continue;
    fields[key] = encodeValue(obj[key]);
  }
  return fields;
}
__name(encodeFields, "encodeFields");
function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) {
    return new Date(value.timestampValue).toISOString();
  }
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(decodeValue);
  }
  if ("mapValue" in value) {
    return decodeFields(value.mapValue.fields || {});
  }
  if ("referenceValue" in value) return value.referenceValue;
  if ("geoPointValue" in value) return value.geoPointValue;
  if ("bytesValue" in value) return value.bytesValue;
  return null;
}
__name(decodeValue, "decodeValue");
function decodeFields(fields = {}) {
  const out = {};
  for (const key of Object.keys(fields)) out[key] = decodeValue(fields[key]);
  return out;
}
__name(decodeFields, "decodeFields");
function decodeDocument(doc) {
  if (!doc) return null;
  const name = String(doc.name || "");
  const id = name.split("/").pop();
  return { id, name, data: decodeFields(doc.fields || {}) };
}
__name(decodeDocument, "decodeDocument");
function encodeFilter(field, op, value) {
  const operators = { "==": "EQUAL", "!=": "NOT_EQUAL", "<": "LESS_THAN", "<=": "LESS_THAN_OR_EQUAL", ">": "GREATER_THAN", ">=": "GREATER_THAN_OR_EQUAL" };
  const operator = operators[op] || op;
  return {
    fieldFilter: {
      field: { fieldPath: field },
      op: operator,
      value: encodeValue(value === void 0 ? null : value)
    }
  };
}
__name(encodeFilter, "encodeFilter");
function toWrite({ type, path, data }, documentsBase) {
  const transforms = [];
  const maskPaths = [];
  const fields = {};
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (value === void 0) continue;
    if (isServerTimestamp(value)) {
      maskPaths.push(key);
      transforms.push({ fieldPath: key, setToServerValue: "REQUEST_TIME" });
      continue;
    }
    maskPaths.push(key);
    fields[key] = encodeValue(value);
  }
  const write = {
    update: { name: `${documentsBase}/${path}`, fields },
    // Full replace for set(), masked merge for update(): with a mask only the
    // listed top-level paths are written, so tx.update(partial) can never
    // clobber sibling fields (mirrors the Admin SDK's update()).
    updateMask: { fieldPaths: maskPaths }
  };
  if (transforms.length) write.updateTransforms = transforms;
  return write;
}
__name(toWrite, "toWrite");
var DocumentSnapshot = class {
  static {
    __name(this, "DocumentSnapshot");
  }
  constructor(doc) {
    this.id = doc ? doc.id : null;
    this._data = doc ? doc.data : null;
    this.exists = doc !== null;
  }
  data() {
    return this._data;
  }
};
var QuerySnapshot = class {
  static {
    __name(this, "QuerySnapshot");
  }
  constructor(docs) {
    this._docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }
  get docs() {
    return this._docs;
  }
  forEach(cb) {
    for (const doc of this._docs) cb(doc);
  }
};
var Query = class _Query {
  static {
    __name(this, "Query");
  }
  constructor(db, collectionId, filters, parentPath = "") {
    this._db = db;
    this._collectionId = collectionId;
    this._filters = filters;
    this._parentPath = parentPath;
  }
  where(field, op, value) {
    return new _Query(
      this._db,
      this._collectionId,
      [...this._filters, encodeFilter(field, op, value)],
      this._parentPath
    );
  }
  _structuredQuery() {
    return {
      from: [{ collectionId: this._collectionId, allDescendants: false }],
      ...this._filters.length ? { where: this._filters.length === 1 ? this._filters[0] : { compositeFilter: { op: "AND", filters: this._filters } } } : {}
    };
  }
  async get(options = {}) {
    const rows = await this._db._runQuery(this._structuredQuery(), this._parentPath, options);
    return new QuerySnapshot(rows.map((row) => new DocumentSnapshot(row)));
  }
};
var DocumentReference = class {
  static {
    __name(this, "DocumentReference");
  }
  constructor(db, path) {
    this._db = db;
    this.path = path;
    this.id = path.split("/").pop();
  }
  async get(options = {}) {
    const doc = await this._db._getDocument(this.path, options);
    return new DocumentSnapshot(doc);
  }
};
var CollectionReference = class extends Query {
  static {
    __name(this, "CollectionReference");
  }
  constructor(db, collectionId, parentPath = "") {
    super(db, collectionId, [], parentPath);
  }
  doc(id) {
    const child = String(id);
    if (!child || child.includes("/")) {
      throw new Error("doc() requires a single-segment document id.");
    }
    return new DocumentReference(
      this._db,
      this._parentPath ? `${this._parentPath}/${this._collectionId}/${child}` : `${this._collectionId}/${child}`
    );
  }
};
var Transaction = class {
  static {
    __name(this, "Transaction");
  }
  constructor(db, id) {
    this._db = db;
    this._id = id;
    this._staged = [];
  }
  async get(refOrQuery) {
    if (refOrQuery instanceof DocumentReference) {
      return refOrQuery.get({ transaction: this._id });
    }
    if (refOrQuery instanceof Query) {
      return refOrQuery.get({ transaction: this._id });
    }
    throw new Error("tx.get() requires a document or query reference.");
  }
  set(ref, data) {
    this._staged.push({ type: "set", path: ref.path, data });
  }
  update(ref, data) {
    this._staged.push({ type: "update", path: ref.path, data });
  }
};
function createFirestore({ projectId, getAccessToken, fetchImpl = fetch, emulatorHost = null } = {}) {
  if (!projectId) throw new Error("createFirestore requires a projectId.");
  if (typeof getAccessToken !== "function") {
    throw new Error("createFirestore requires a getAccessToken provider.");
  }
  const base = emulatorHost ? `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents` : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const documentsRoot = `projects/${projectId}/databases/(default)/documents`;
  async function request(path, { method = "GET", query = null, body = null } = {}) {
    const url = new URL(`${base}${path}`);
    if (query) url.searchParams.set(query.name, query.value);
    const token = emulatorHost ? "owner" : await getAccessToken();
    const res = await fetchImpl(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...body ? { "Content-Type": "application/json" } : {},
        // The Java-based emulator recycles idle keep-alive sockets in a way
        // that races undici's connection pool (ECONNRESET). One connection per
        // request avoids it; Google's production endpoint is unaffected.
        ...emulatorHost ? { Connection: "close" } : {}
      },
      ...body ? { body: JSON.stringify(body) } : {}
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    return { ok: res.ok, status: res.status, payload };
  }
  __name(request, "request");
  function serverError(hint, status, payload) {
    const msg = payload && payload.error && payload.error.message;
    return new Error(`${hint} (${status})${msg ? `: ${msg}` : ""}`);
  }
  __name(serverError, "serverError");
  async function runQuery(structuredQuery, parentPath, { transaction = null } = {}) {
    const parent = parentPath ? `/${parentPath}` : "";
    const { ok, status, payload } = await request(`${parent}:runQuery`, {
      method: "POST",
      body: { structuredQuery, ...transaction ? { transaction } : {} }
    });
    if (!ok) {
      throw serverError("Firestore runQuery failed", status, payload);
    }
    const rows = [];
    for (const entry of payload || []) {
      if (entry.document) rows.push(decodeDocument(entry.document));
    }
    return rows;
  }
  __name(runQuery, "runQuery");
  const db = {
    // Direct document read by full Firestore path. The shared order engine
    // uses collection(...).doc(...), while server-side image authorization
    // also needs nested paths such as restaurants/{id}/categories/{id}.
    async getDocument(path) {
      const doc = await this._getDocument(path);
      return new DocumentSnapshot(doc);
    },
    // Transactional document reads are served by POST :runQuery with an exact
    // __name__ equality filter inside the SAME transaction, not by the
    // documented GET ?transaction= contract: the Firestore emulator (jar
    // v1.22.0, pinned by firebase-tools 15.34.0) accepts that GET and then
    // never answers it (observed: hang → ECONNRESET), while RunQueryRequest
    // with the transaction set works and preserves the transaction's read
    // set, snapshot isolation, and commit-time conflict detection (verified
    // against the emulator). RunQueryRequest.transaction is part of the
    // official REST contract, so this path also serves production.
    async _getDocument(path, { transaction = null } = {}) {
      const segments = String(path || "").split("/");
      if (segments.length < 2 || segments.length % 2 !== 0 || segments.some(
        (segment) => !segment || segment === "." || segment === ".."
      )) {
        throw new Error(`Invalid document path: ${path}`);
      }
      if (!transaction) {
        const { ok, status, payload } = await request(`/${path}`);
        if (ok) return decodeDocument(payload);
        if (status === 404) return null;
        throw serverError("Firestore get failed", status, payload);
      }
      const collectionId = segments[segments.length - 2];
      const parentPath = segments.slice(0, -2).join("/");
      const rows = await runQuery(
        {
          from: [{ collectionId, allDescendants: false }],
          where: {
            fieldFilter: {
              field: { fieldPath: "__name__" },
              op: "EQUAL",
              value: { referenceValue: `${documentsRoot}/${path}` }
            }
          }
        },
        parentPath,
        { transaction }
      );
      return rows.length ? rows[0] : null;
    },
    _runQuery: runQuery,
    collection(name) {
      return new CollectionReference(db, name);
    },
    // Mirrors Admin-SDK runTransaction: reads inside the callback carry the
    // transaction id, staged writes are committed together, and an ABORTED
    // commit (a read document changed mid-flight) retries the whole callback
    // with fresh reads — the engine relies on this for concurrent-checkout
    // idempotency.
    async runTransaction(fn, { attempts = 5 } = {}) {
      let lastError = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const started = await request(":beginTransaction", {
          method: "POST",
          body: { options: { readWrite: {} } }
        });
        if (!started.ok || !started.payload || !started.payload.transaction) {
          throw serverError("Firestore beginTransaction failed", started.status, started.payload);
        }
        const transaction = started.payload.transaction;
        const tx = new Transaction(db, transaction);
        const result = await fn(tx);
        if (!tx._staged.length) return result;
        const committed = await request(":commit", {
          method: "POST",
          body: { transaction, writes: tx._staged.map((staged) => toWrite(staged, documentsRoot)) }
        });
        if (committed.ok) return result;
        lastError = serverError("Firestore commit failed", committed.status, committed.payload);
        if (committed.status !== 409) throw lastError;
      }
      throw lastError || new Error("Firestore transaction retries exhausted.");
    }
  };
  return db;
}
__name(createFirestore, "createFirestore");

// src/serviceAccount.js
var TOKEN_URL = "https://oauth2.googleapis.com/token";
var SCOPE = "https://www.googleapis.com/auth/datastore";
var TOKEN_LIFETIME_SEC = 3600;
var TOKEN_SKEW_SEC = 600;
function parseServiceAccount(raw) {
  if (!raw) {
    throw new ConfigurationError(
      "service_account_missing",
      "FIREBASE_SERVICE_ACCOUNT_JSON is required (wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON)."
    );
  }
  let account;
  try {
    account = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new ConfigurationError(
      "service_account_invalid_json",
      "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON."
    );
  }
  if (!account.project_id || !account.private_key || !account.client_email) {
    throw new ConfigurationError(
      "service_account_invalid_shape",
      "FIREBASE_SERVICE_ACCOUNT_JSON must contain project_id, client_email and private_key."
    );
  }
  return account;
}
__name(parseServiceAccount, "parseServiceAccount");
function base64url(bytes) {
  let binary = "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64url, "base64url");
function pemToDer(pem) {
  const body = String(pem).replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
__name(pemToDer, "pemToDer");
async function importPrivateKey(pem) {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}
__name(importPrivateKey, "importPrivateKey");
async function signAssertion(account, nowSec) {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + TOKEN_LIFETIME_SEC
  };
  const signingInput = `${base64url(new TextEncoder().encode(JSON.stringify(header)))}.${base64url(
    new TextEncoder().encode(JSON.stringify(claims))
  )}`;
  const key = await importPrivateKey(account.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64url(signature)}`;
}
__name(signAssertion, "signAssertion");
function createAccessTokenProvider({ account, fetchImpl = fetch, now = /* @__PURE__ */ __name(() => Date.now() / 1e3, "now") } = {}) {
  if (!account || !account.private_key || !account.client_email) {
    throw new Error("createAccessTokenProvider requires a parsed service account.");
  }
  let inFlight = null;
  let cached = null;
  async function mint() {
    const nowSec = Math.floor(now());
    if (cached && cached.expiresAtSec - TOKEN_SKEW_SEC > nowSec) {
      return cached.token;
    }
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const assertion = await signAssertion(account, nowSec);
      const res = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion
        }).toString()
      });
      if (!res.ok) {
        throw new Error(`Google token endpoint responded with ${res.status}.`);
      }
      const body = await res.json();
      if (!body || !body.access_token) {
        throw new Error("Google token endpoint returned no access_token.");
      }
      cached = {
        token: body.access_token,
        expiresAtSec: nowSec + Number(body.expires_in || TOKEN_LIFETIME_SEC)
      };
      return cached.token;
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }
  __name(mint, "mint");
  return mint;
}
__name(createAccessTokenProvider, "createAccessTokenProvider");

// src/supabaseStorage.js
var DEFAULT_TIMEOUT_MS = 15e3;
var CLEANUP_TIMEOUT_MS = 2e3;
function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new ConfigurationError(
      "supabase_url_missing",
      "SUPABASE_URL is required for image storage."
    );
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigurationError(
      "supabase_url_invalid",
      "SUPABASE_URL must be a valid URL."
    );
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new ConfigurationError(
      "supabase_url_invalid",
      "SUPABASE_URL must use http or https."
    );
  }
  const loopbackHosts = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (parsed.protocol === "http:" && !loopbackHosts.has(parsed.hostname)) {
    throw new ConfigurationError(
      "supabase_url_insecure",
      "SUPABASE_URL must use https for a remote host."
    );
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ConfigurationError(
      "supabase_url_invalid",
      "SUPABASE_URL must not contain credentials, a query string, or a fragment."
    );
  }
  return parsed.toString().replace(/\/+$/, "");
}
__name(normalizeBaseUrl, "normalizeBaseUrl");
function requireServiceRoleKey(value) {
  const key = String(value || "").trim();
  if (!key) {
    throw new ConfigurationError(
      "supabase_service_role_key_missing",
      "SUPABASE_SERVICE_ROLE_KEY is required for image storage."
    );
  }
  return key;
}
__name(requireServiceRoleKey, "requireServiceRoleKey");
function encodeObjectPath(path) {
  return String(path || "").split("/").filter(Boolean).map((segment) => encodeURIComponent(segment)).join("/");
}
__name(encodeObjectPath, "encodeObjectPath");
function safeTimeout(timeoutMs) {
  const parsed = Number(timeoutMs);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}
__name(safeTimeout, "safeTimeout");
function createSupabaseStorage({
  url,
  serviceRoleKey,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const baseUrl = normalizeBaseUrl(url);
  const key = requireServiceRoleKey(serviceRoleKey);
  const requestTimeoutMs = safeTimeout(timeoutMs);
  async function request(path, {
    method = "GET",
    body = null,
    contentType = null,
    timeout = requestTimeoutMs,
    extraHeaders = null
  } = {}) {
    const controller = new AbortController();
    let timer = null;
    let timedOut = false;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(
          new UpstreamUnavailableError("Supabase Storage request timed out.", {
            code: "supabase_timeout",
            status: 504,
            cleanupMayHaveSucceeded: true
          })
        );
      }, safeTimeout(timeout));
    });
    let response;
    try {
      response = await Promise.race([
        fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            ...contentType ? { "Content-Type": contentType } : {},
            ...extraHeaders || {}
          },
          ...body ? { body } : {},
          signal: controller.signal
        }),
        timeoutPromise
      ]);
    } catch (error) {
      if (error && error.name === "UpstreamUnavailableError") throw error;
      throw new UpstreamUnavailableError(
        timedOut ? "Supabase Storage request timed out." : "Supabase Storage could not be reached.",
        {
          code: timedOut ? "supabase_timeout" : "supabase_unreachable",
          status: 504,
          cleanupMayHaveSucceeded: true
        }
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
    return response;
  }
  __name(request, "request");
  async function jsonBody(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  __name(jsonBody, "jsonBody");
  return {
    get baseUrl() {
      return baseUrl;
    },
    publicUrl(bucket, path) {
      if (bucket === STORAGE_BUCKETS.PROFILE_IMAGES) {
        throw new ConfigurationError(
          "private_bucket_public_url_forbidden",
          "Private profile images cannot be exposed through a public URL."
        );
      }
      return `${baseUrl}/storage/v1/object/public/${encodeObjectPath(bucket)}/${encodeObjectPath(path)}`;
    },
    async upload(bucket, path, bytes, contentType) {
      const response = await request(
        `/storage/v1/object/${encodeObjectPath(bucket)}/${encodeObjectPath(path)}`,
        {
          method: "POST",
          body: bytes,
          contentType,
          // Never overwrite an existing object. A retry uses a new generated
          // object name, while a stale client can never replace another asset.
          extraHeaders: { "x-upsert": "false" }
        }
      );
      if (!response.ok) {
        if (response.status === 409) {
          throw new StorageConflictError(
            "The generated image object already exists."
          );
        }
        throw new UpstreamUnavailableError(
          `Supabase Storage upload failed (${response.status}).`,
          {
            code: "supabase_upload_failed",
            status: 503,
            // A 5xx response can still be ambiguous. A definitive 4xx did not
            // create the object and must never trigger deletion of an
            // existing object at the same path.
            cleanupMayHaveSucceeded: response.status >= 500
          }
        );
      }
      const body = await jsonBody(response);
      return {
        bucket,
        path,
        id: body && body.Id ? body.Id : null
      };
    },
    async remove(bucket, path, { timeout = CLEANUP_TIMEOUT_MS } = {}) {
      const response = await request(
        `/storage/v1/object/${encodeObjectPath(bucket)}/${encodeObjectPath(path)}`,
        { method: "DELETE", timeout }
      );
      if (response.status === 404) return false;
      if (!response.ok) {
        throw new UpstreamUnavailableError(
          `Supabase Storage delete failed (${response.status}).`,
          {
            code: "supabase_delete_failed",
            status: 503
          }
        );
      }
      return true;
    },
    async createSignedUrl(bucket, path, expiresIn) {
      const response = await request(
        `/storage/v1/object/sign/${encodeObjectPath(bucket)}/${encodeObjectPath(path)}`,
        {
          method: "POST",
          body: JSON.stringify({ expiresIn }),
          contentType: "application/json"
        }
      );
      if (!response.ok) {
        throw new UpstreamUnavailableError(
          `Supabase Storage signing failed (${response.status}).`,
          {
            code: "supabase_signing_failed",
            status: 503
          }
        );
      }
      const body = await jsonBody(response);
      const signed = body && typeof body.signedURL === "string" ? body.signedURL : "";
      if (!signed) {
        throw new UpstreamUnavailableError("Supabase Storage returned no signed URL.");
      }
      let resolved;
      if (signed.startsWith("http://") || signed.startsWith("https://")) {
        resolved = signed;
      } else if (signed.startsWith("/")) {
        resolved = `${baseUrl}/storage/v1${signed}`;
      } else {
        throw new UpstreamUnavailableError("Supabase Storage returned an invalid signed URL.");
      }
      let parsed;
      try {
        parsed = new URL(resolved);
      } catch {
        throw new UpstreamUnavailableError("Supabase Storage returned an invalid signed URL.");
      }
      if (parsed.origin !== new URL(baseUrl).origin) {
        throw new UpstreamUnavailableError("Supabase Storage returned an invalid signed URL.");
      }
      return resolved;
    }
  };
}
__name(createSupabaseStorage, "createSupabaseStorage");

// src/index.js
function createWorkerEntrypoint(cache2 = {}) {
  const state = {
    app: null,
    services: null,
    initError: null,
    imageServices: null,
    imageInitError: null,
    ...cache2
  };
  function buildServices(env) {
    const projectId = env.FIREBASE_PROJECT_ID || null;
    const account = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const getAccessToken = createAccessTokenProvider({ account });
    const db = createFirestore({
      projectId: projectId || account.project_id,
      getAccessToken,
      emulatorHost: env.FIRESTORE_EMULATOR_HOST || null
    });
    const verifyToken = createVerifyIdToken({
      projectId: projectId || account.project_id,
      apiKey: env.FIREBASE_WEB_API_KEY || ""
    });
    const orderService = (0, import_orderServiceCore.createOrderService)({ db, serverTimestamp });
    return { orderService, verifyToken, db };
  }
  __name(buildServices, "buildServices");
  function getServices(env) {
    if (state.services) return state.services;
    if (state.initError) throw state.initError;
    try {
      state.services = buildServices(env);
      return state.services;
    } catch (err) {
      state.initError = isConfigurationError(err) ? err : new ConfigurationError(
        "service_init_failed",
        "The order service could not be initialised."
      );
      console.error(
        "[worker] init failed:",
        safeErrorMessage(err, [env.FIREBASE_SERVICE_ACCOUNT_JSON])
      );
      throw state.initError;
    }
  }
  __name(getServices, "getServices");
  function getImageServices(env) {
    if (state.imageServices) return state.imageServices;
    if (state.imageInitError) throw state.imageInitError;
    try {
      const storage = createSupabaseStorage({
        url: env.SUPABASE_URL,
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY
      });
      const api = createImageApi({ db: getServices(env).db, storage });
      state.imageServices = { api, storage };
      return state.imageServices;
    } catch (err) {
      state.imageInitError = isConfigurationError(err) ? err : new ConfigurationError(
        "image_service_init_failed",
        "The image service could not be initialised."
      );
      console.error(
        "[worker] image init failed:",
        safeErrorMessage(err, [
          env.SUPABASE_SERVICE_ROLE_KEY,
          env.FIREBASE_SERVICE_ACCOUNT_JSON
        ])
      );
      throw state.imageInitError;
    }
  }
  __name(getImageServices, "getImageServices");
  function getApp(env) {
    if (state.app) return state.app;
    const orderService = {
      createOrder: /* @__PURE__ */ __name((arg) => getServices(env).orderService.createOrder(arg), "createOrder"),
      getGuestOrder: /* @__PURE__ */ __name((arg) => getServices(env).orderService.getGuestOrder(arg), "getGuestOrder")
    };
    const verifyToken = /* @__PURE__ */ __name((token) => getServices(env).verifyToken(token), "verifyToken");
    const imageService = {
      upload: /* @__PURE__ */ __name((args) => getImageServices(env).api.upload(args), "upload"),
      signedUrl: /* @__PURE__ */ __name((args) => getImageServices(env).api.signedUrl(args), "signedUrl"),
      remove: /* @__PURE__ */ __name((args) => getImageServices(env).api.remove(args), "remove")
    };
    state.app = createWorkerApp({
      orderService,
      verifyToken,
      imageService,
      allowedOrigins: env.CORS_ALLOWED_ORIGINS || "",
      mode: env.DEMO_MODE === "false" ? "live" : "demo",
      projectId: env.FIREBASE_PROJECT_ID || null,
      logError: /* @__PURE__ */ __name((err) => {
        const secrets = [
          env.SUPABASE_SERVICE_ROLE_KEY,
          env.FIREBASE_SERVICE_ACCOUNT_JSON
        ];
        console.error("[api]", safeErrorMessage(err, secrets));
      }, "logError"),
      getServiceStatus: /* @__PURE__ */ __name(() => readServiceStatus2(env), "getServiceStatus")
    });
    return state.app;
  }
  __name(getApp, "getApp");
  function readServiceStatus2(env) {
    let firebase;
    if (state.services) {
      firebase = { state: "ready" };
    } else if (state.initError) {
      firebase = { state: "error", code: state.initError.code };
    } else {
      try {
        parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
        firebase = { state: "configured" };
      } catch (err) {
        const code = isConfigurationError(err) ? err.code : "service_init_failed";
        firebase = { state: "error", code };
      }
    }
    let supabase;
    if (state.imageServices) {
      supabase = { state: "ready" };
    } else if (state.imageInitError) {
      supabase = { state: "error", code: state.imageInitError.code };
    } else if (!String(env.SUPABASE_URL || "").trim()) {
      supabase = { state: "error", code: "supabase_url_missing" };
    } else if (!String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim()) {
      supabase = { state: "error", code: "supabase_service_role_key_missing" };
    } else {
      supabase = { state: "configured" };
    }
    return { firebase, supabase };
  }
  __name(readServiceStatus2, "readServiceStatus");
  function errorResponse(request, env, err) {
    const secrets = [
      env && env.SUPABASE_SERVICE_ROLE_KEY,
      env && env.FIREBASE_SERVICE_ACCOUNT_JSON
    ];
    console.error("[worker] unhandled error:", safeErrorMessage(err, secrets));
    const origin = request.headers.get("Origin");
    const allowed = parseAllowedOrigins(env && env.CORS_ALLOWED_ORIGINS || "");
    const config = isConfigurationError(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: config ? "The order service is temporarily unavailable. Please try again." : "The order server encountered an error."
      }),
      {
        status: config ? 503 : 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeadersForRequest(origin, allowed)
        }
      }
    );
  }
  __name(errorResponse, "errorResponse");
  return {
    async fetch(request, env) {
      try {
        const handle = getApp(env);
        return await handle(request);
      } catch (err) {
        return errorResponse(request, env, err);
      }
    }
  };
}
__name(createWorkerEntrypoint, "createWorkerEntrypoint");
var index_default = createWorkerEntrypoint();
export {
  createWorkerEntrypoint,
  index_default as default
};
//# sourceMappingURL=index.js.map
