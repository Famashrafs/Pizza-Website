import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { getCart, saveCart } from '../services/storage';
import {
  calculateTotals,
  calculateItemTotal,
  resolveDiscount,
  DEFAULT_DELIVERY_FEE,
  DEFAULT_TAX_RATE,
  FREE_DELIVERY_THRESHOLD,
} from '../utils/cartPricing';
import {
  addItemToCart,
  updateCartItem,
  removeCartItem,
  setCartItemQty,
  clearCartItems,
} from '../utils/cartReducer';

const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}

const GUEST_UID = 'guest';

function loadCart(uid) {
  const stored = getCart(uid);
  return { uid, items: stored.items, promoCode: stored.promoCode };
}

export function CartProvider({ children }) {
  const { currentUser } = useAuth();
  const uid = currentUser ? currentUser.uid : GUEST_UID;

  const [state, setState] = useState(() => loadCart(uid));
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  // Load the cart for the active user. When signing in, fold any guest cart
  // into the account cart so nothing is lost (sync-ready behaviour).
  useEffect(() => {
    const accountCart = loadCart(uid);

    if (uid !== GUEST_UID) {
      const guestCart = loadCart(GUEST_UID);
      if (guestCart.items.length) {
        const merged = guestCart.items.reduce(
          (acc, item) => addItemToCart(acc, item),
          accountCart.items
        );
        setState({ uid, items: merged, promoCode: accountCart.promoCode });
        saveCart(GUEST_UID, { items: [], promoCode: '' });
        setDrawerOpen(false);
        return;
      }
    }

    setState(accountCart);
    setDrawerOpen(false);
  }, [uid]);

  // Persist, but only once state belongs to the active user (avoids writing a
  // previous user's cart under a new key during account switches).
  useEffect(() => {
    if (state.uid !== uid) return;
    saveCart(uid, {
      items: state.items,
      promoCode: state.promoCode,
      updatedAt: new Date().toISOString(),
    });
  }, [uid, state]);

  const items = useMemo(
    () =>
      state.items.map((item) => ({
        ...item,
        lineTotal: calculateItemTotal(item),
      })),
    [state.items]
  );

  const totals = useMemo(
    () =>
      calculateTotals(items, {
        promoCode: state.promoCode,
        deliveryFee: DEFAULT_DELIVERY_FEE,
        taxRate: DEFAULT_TAX_RATE,
        freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
      }),
    [items, state.promoCode]
  );

  const setItems = useCallback((updater) => {
    setState((prev) => ({ ...prev, items: updater(prev.items) }));
  }, []);

  const addItem = useCallback(
    (item) => setItems((prev) => addItemToCart(prev, item)),
    [setItems]
  );

  const updateItem = useCallback(
    (id, nextItem) => setItems((prev) => updateCartItem(prev, id, nextItem)),
    [setItems]
  );

  const removeItem = useCallback(
    (id) => setItems((prev) => removeCartItem(prev, id)),
    [setItems]
  );

  const updateQty = useCallback(
    (id, qty) => setItems((prev) => setCartItemQty(prev, id, qty)),
    [setItems]
  );

  const clearCart = useCallback(() => {
    setState((prev) => ({ ...prev, items: clearCartItems(), promoCode: '' }));
  }, []);

  const applyPromo = useCallback(
    (code) => {
      const clean = String(code || '').trim().toUpperCase();
      const result = resolveDiscount(clean, totals.subtotal);
      if (!result.code) {
        return { success: false, message: 'That promo code is not valid.' };
      }
      setState((prev) => ({ ...prev, promoCode: result.code }));
      return { success: true, message: `Promo applied: ${result.label}` };
    },
    [totals.subtotal]
  );

  const clearPromo = useCallback(() => {
    setState((prev) => ({ ...prev, promoCode: '' }));
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const value = {
    // items (with computed lineTotal)
    items,
    count: totals.itemCount,
    itemCount: items.length,
    isEmpty: items.length === 0,
    // pricing (single source of truth)
    subtotal: totals.subtotal,
    discount: totals.discount,
    discountLabel: totals.discountLabel,
    promoCode: totals.promoCode,
    deliveryFee: totals.deliveryFee,
    freeDelivery: totals.freeDelivery,
    tax: totals.tax,
    taxRate: totals.taxRate,
    grandTotal: totals.total,
    total: totals.total,
    // mutations
    addItem,
    updateItem,
    removeItem,
    updateQty,
    clearCart,
    applyPromo,
    clearPromo,
    // drawer UI
    isDrawerOpen,
    openDrawer,
    closeDrawer,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export default CartContext;
