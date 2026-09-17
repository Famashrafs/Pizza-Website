import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import CartLine from '../components/CartLine';
import CartItemEditor from '../components/CartItemEditor';
import ConfirmDialog from '../components/ConfirmDialog';

function CartPage() {
  const {
    items,
    count,
    subtotal,
    discount,
    discountLabel,
    promoCode,
    deliveryFee,
    freeDelivery,
    tax,
    taxRate,
    grandTotal,
    updateQty,
    removeItem,
    clearCart,
    applyPromo,
    clearPromo,
  } = useCart();
  const { showToast } = useToast();
  const [editingItem, setEditingItem] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [promoInput, setPromoInput] = useState('');

  const handleIncrease = (item) => updateQty(item.id, item.qty + 1);
  const handleDecrease = (item) => updateQty(item.id, item.qty - 1);
  const handleRemove = (item) => {
    removeItem(item.id);
    showToast(`${item.name} removed from cart.`);
  };

  const handleApplyPromo = (event) => {
    event.preventDefault();
    const result = applyPromo(promoInput);
    showToast(result.message, result.success ? 'success' : 'error');
    if (result.success) setPromoInput('');
  };

  const handleConfirmClear = () => {
    clearCart();
    setConfirmClear(false);
    showToast('Your cart has been cleared.');
  };

  if (items.length === 0) {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">YOUR CART</h1>
        </div>
        <div className="cart-empty">
          <p className="cart-empty-emoji" aria-hidden="true">
            🍕
          </p>
          <h2>Your cart is empty</h2>
          <p>Looks like you haven&apos;t added anything yet.</p>
          <Link to="/menu" className="contact-btn cart-empty-btn">
            Explore Menu
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">YOUR CART</h1>
      </div>

      <div className="cart-layout">
        <section className="cart-items" aria-label="Cart items">
          <div className="cart-items-head">
            <h2>
              {count} {count === 1 ? 'item' : 'items'} in your cart
            </h2>
            <button
              type="button"
              className="cart-clear"
              onClick={() => setConfirmClear(true)}
            >
              Clear Cart
            </button>
          </div>

          {items.map((item) => (
            <CartLine
              key={item.id}
              item={item}
              variant="page"
              onIncrease={handleIncrease}
              onDecrease={handleDecrease}
              onRemove={handleRemove}
              onEdit={item.config ? setEditingItem : undefined}
              editing={editingItem ? editingItem.id === item.id : false}
            />
          ))}
        </section>

        <aside className="cart-summary-panel" aria-label="Order summary">
          <h2>Order Summary</h2>

          <div className="summary-line">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>

          {discount > 0 && (
            <div className="summary-line summary-line--discount">
              <span>Discount{promoCode ? ` (${promoCode})` : ''}</span>
              <span>-${discount.toFixed(2)}</span>
            </div>
          )}

          <div className="summary-line">
            <span>Delivery fee</span>
            <span>{freeDelivery ? 'Free' : `$${deliveryFee.toFixed(2)}`}</span>
          </div>

          <div className="summary-line">
            <span>Tax ({Math.round((taxRate || 0) * 100)}%)</span>
            <span>${tax.toFixed(2)}</span>
          </div>

          <div className="summary-line summary-line--total">
            <span>Grand total</span>
            <span>${grandTotal.toFixed(2)}</span>
          </div>

          <form className="promo-form" onSubmit={handleApplyPromo}>
            <label htmlFor="promo-code">Promo code</label>
            <div className="promo-row">
              <input
                id="promo-code"
                type="text"
                value={promoInput}
                placeholder="PIZZA10"
                onChange={(event) => setPromoInput(event.target.value)}
              />
              <button type="submit">Apply</button>
            </div>
            {promoCode && (
              <p className="promo-applied">
                <span>{discountLabel || `Code ${promoCode} applied`}</span>
                <button type="button" onClick={clearPromo}>
                  Remove
                </button>
              </p>
            )}
          </form>

          <Link to="/checkout" className="contact-btn cart-checkout-btn">
            Proceed to Checkout
          </Link>
          <Link to="/menu" className="cart-continue">
            Continue shopping
          </Link>
        </aside>
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="Clear your cart?"
          message="This removes all items from your cart. This cannot be undone."
          confirmLabel="Clear Cart"
          cancelLabel="Keep Items"
          danger
          onConfirm={handleConfirmClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {editingItem && (
        <CartItemEditor
          item={editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}

export default CartPage;
