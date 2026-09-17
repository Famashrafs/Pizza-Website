const MAX_INSTRUCTIONS = 200;

const round2 = (value) => Math.round(value * 100) / 100;

const slug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function hasCustomization(product) {
  return Boolean(
    (product.sizes && product.sizes.length) ||
      (product.crusts && product.crusts.length) ||
      (product.toppings && product.toppings.length)
  );
}

export function resolveSize(product, sizeLabel) {
  const sizes = product.sizes || [];
  if (!sizes.length) return null;
  if (sizeLabel) {
    const match = sizes.find((size) => size.label === sizeLabel);
    if (match) return match;
  }
  const fallback = sizes.find((size) => size.label === product.defaultSize);
  return fallback || sizes[0] || null;
}

export function resolveCrust(product, crustId) {
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

export function resolveToppings(product, toppingIds = []) {
  const list = product.toppings || [];
  const ids = Array.isArray(toppingIds) ? toppingIds : [];
  return list.filter((topping) => ids.includes(topping.id));
}

// Single source of truth for a configured unit price:
// base price + size adjustment + crust price + toppings.
export function calculateUnitPrice(
  product,
  { size = null, crust = null, toppings = [] } = {}
) {
  const base = Number(product.basePrice) || 0;
  const sizeAdjust = size ? Number(size.adjust) || 0 : 0;
  const crustPrice = crust ? Number(crust.price) || 0 : 0;
  const toppingsTotal = (toppings || []).reduce(
    (sum, topping) => sum + (Number(topping.price) || 0),
    0
  );
  return round2(base + sizeAdjust + crustPrice + toppingsTotal);
}

export function calculateTotal(product, config = {}) {
  const qty = normalizeQty(config.qty);
  return round2(calculateUnitPrice(product, config) * qty);
}

export function normalizeQty(qty) {
  const value = Math.floor(Number(qty));
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

export function validateConfiguration(product, config = {}) {
  const {
    size = null,
    crust = null,
    toppings = [],
    qty = 1,
    instructions = '',
  } = config;
  const errors = [];

  if ((product.sizes || []).length && !size) {
    errors.push('Please select a size.');
  }
  if ((product.crusts || []).filter((c) => c.available !== false).length && !crust) {
    errors.push('Please select a crust.');
  }

  const catalog = product.toppings || [];
  const unavailable = toppings.filter((topping) => topping.available === false);
  if (unavailable.length) {
    errors.push(
      `Remove unavailable toppings: ${unavailable
        .map((topping) => topping.name)
        .join(', ')}.`
    );
  }
  const unknown = toppings.filter(
    (topping) => !catalog.some((entry) => entry.id === topping.id)
  );
  if (unknown.length) {
    errors.push('One or more selected toppings are no longer available.');
  }

  const max = Number(product.maxToppings) || 0;
  if (max > 0 && toppings.length > max) {
    errors.push(`Choose at most ${max} toppings.`);
  }

  const parsedQty = Number(qty);
  if (!Number.isInteger(parsedQty) || parsedQty < 1) {
    errors.push('Quantity must be a whole number of at least 1.');
  }

  if (String(instructions).length > MAX_INSTRUCTIONS) {
    errors.push(`Special instructions must be ${MAX_INSTRUCTIONS} characters or fewer.`);
  }

  return { valid: errors.length === 0, errors };
}

export function createCartItem(product, config = {}) {
  const size = config.size ?? resolveSize(product, config.sizeLabel);
  const crust = config.crust ?? resolveCrust(product, config.crustId);
  const toppings = (config.toppings
    ? config.toppings
    : resolveToppings(product, config.toppingIds)
  ).slice();
  const qty = normalizeQty(config.qty);
  const instructions = String(config.instructions ?? '')
    .trim()
    .slice(0, MAX_INSTRUCTIONS);

  if (!validateConfiguration(product, { size, crust, toppings, qty, instructions }).valid) {
    return null;
  }

  const unitPrice = calculateUnitPrice(product, { size, crust, toppings });
  const sortedToppings = [...toppings].sort((a, b) => a.id.localeCompare(b.id));

  // Every distinct configuration produces a distinct id (and lines with the
  // same configuration merge). Topping order and case never affect identity.
  const configKey = [
    size ? slug(size.label) : 'nosize',
    crust ? slug(crust.id || crust.label) : 'nocrust',
    ...sortedToppings.map((topping) => topping.id),
    instructions ? `note-${slug(instructions)}` : 'nonote',
  ].join('|');

  const optionNames = [];
  if (size) optionNames.push(size.label);
  if (crust) optionNames.push(crust.label);
  const toppingNames = sortedToppings.map((topping) => topping.name);
  const desc = toppingNames.length
    ? `Toppings: ${toppingNames.join(', ')}`
    : '';

  return {
    id: `${product.id}__${configKey}`,
    productId: product.id,
    name: `${product.name}${optionNames.length ? ` (${optionNames.join(', ')})` : ''}`,
    price: unitPrice,
    unitPrice,
    image: product.image,
    size: size ? size.label : null,
    crust: crust ? crust.label : null,
    toppings: toppingNames,
    desc,
    instructions,
    lineTotal: calculateTotal(product, { size, crust, toppings, qty }),
    config: {
      sizeLabel: size ? size.label : null,
      crustId: crust ? crust.id : null,
      toppingIds: sortedToppings.map((topping) => topping.id),
      instructions,
    },
    qty,
  };
}

export function createSimpleCartItem(product) {
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
    desc: '',
    instructions: '',
    lineTotal: unitPrice,
    config: null,
    qty: 1,
  };
}
