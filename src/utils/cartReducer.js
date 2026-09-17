import { normalizeQty } from './cartItem.js';

// Pure cart operations. Keeping these pure makes merging/duplicate rules
// easy to test and keeps CartContext thin.

export function addItemToCart(items, item) {
  if (!item || !item.id) return items;
  const qty = normalizeQty(item.qty ?? 1);
  const existing = items.find((entry) => entry.id === item.id);
  if (existing) {
    return items.map((entry) =>
      entry.id === item.id ? { ...entry, qty: entry.qty + qty } : entry
    );
  }
  return [...items, { ...item, qty }];
}

export function updateCartItem(items, id, nextItem) {
  if (!nextItem) return items;
  const index = items.findIndex((entry) => entry.id === id);
  if (index === -1) return items;

  const qty = normalizeQty(nextItem.qty ?? 1);
  const replacement = { ...nextItem, qty };

  const collision = items.some(
    (entry) => entry.id === replacement.id && entry.id !== id
  );
  if (collision) {
    return items
      .filter((entry) => entry.id !== id)
      .map((entry) =>
        entry.id === replacement.id ? { ...entry, qty: entry.qty + qty } : entry
      );
  }

  return items.map((entry, entryIndex) =>
    entryIndex === index ? replacement : entry
  );
}

export function removeCartItem(items, id) {
  return items.filter((entry) => entry.id !== id);
}

export function setCartItemQty(items, id, qty) {
  // Minimum quantity is 1. Going below simply clamps (use Remove to delete).
  const nextQty = normalizeQty(qty);
  return items.map((entry) =>
    entry.id === id ? { ...entry, qty: nextQty } : entry
  );
}

export function clearCartItems() {
  return [];
}
