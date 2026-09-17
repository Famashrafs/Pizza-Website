import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faCartShopping } from '@fortawesome/free-solid-svg-icons';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import CartLine from './CartLine';
import CartItemEditor from './CartItemEditor';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CartDrawer() {
  const {
    items,
    count,
    subtotal,
    grandTotal,
    isDrawerOpen,
    closeDrawer,
    updateQty,
    removeItem,
  } = useCart();
  const { showToast } = useToast();
  const [editingItem, setEditingItem] = useState(null);
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const editingRef = useRef(null);

  useEffect(() => {
    editingRef.current = editingItem;
  }, [editingItem]);

  useEffect(() => {
    if (!isDrawerOpen) return undefined;
    previouslyFocused.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (panelRef.current) panelRef.current.focus();

    const handleKey = (event) => {
      if (event.key !== 'Escape') return;
      // Let the customization modal handle Escape when it is on top.
      if (editingRef.current) return;
      event.preventDefault();
      closeDrawer();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused.current?.focus) previouslyFocused.current.focus();
    };
  }, [isDrawerOpen, closeDrawer]);

  if (!isDrawerOpen) return null;

  const handleTab = (event) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const nodes = Array.from(
      panelRef.current.querySelectorAll(FOCUSABLE)
    ).filter((node) => node.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleIncrease = (item) => updateQty(item.id, item.qty + 1);
  const handleDecrease = (item) => updateQty(item.id, item.qty - 1);
  const handleRemove = (item) => {
    removeItem(item.id);
    showToast(`${item.name} removed from cart.`);
  };

  return (
    <>
      <div
        className="cart-drawer-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
      >
        <aside
          className="cart-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Shopping cart"
          ref={panelRef}
          tabIndex={-1}
          onKeyDown={handleTab}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="cart-drawer-head">
            <h2>
              <FontAwesomeIcon icon={faCartShopping} />
              <span>Your Cart</span>
              {count > 0 && <span className="cart-drawer-count">({count})</span>}
            </h2>
            <button
              type="button"
              className="cart-drawer-close"
              onClick={closeDrawer}
              aria-label="Close cart"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </header>

          <div className="cart-drawer-body">
            {items.length === 0 ? (
              <div className="cart-drawer-empty">
                <p className="cart-empty-emoji" aria-hidden="true">
                  🍕
                </p>
                <h3>Your cart is empty</h3>
                <p>Add something delicious from the menu.</p>
                <Link to="/menu" className="contact-btn" onClick={closeDrawer}>
                  Explore Menu
                </Link>
              </div>
            ) : (
              items.map((item) => (
                <CartLine
                  key={item.id}
                  item={item}
                  variant="drawer"
                  onIncrease={handleIncrease}
                  onDecrease={handleDecrease}
                  onRemove={handleRemove}
                  onEdit={item.config ? setEditingItem : undefined}
                  editing={editingItem ? editingItem.id === item.id : false}
                />
              ))
            )}
          </div>

          {items.length > 0 && (
            <footer className="cart-drawer-foot">
              <div className="cart-drawer-row">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="cart-drawer-row cart-drawer-row--total">
                <span>Total</span>
                <span>${grandTotal.toFixed(2)}</span>
              </div>
              <Link
                to="/checkout"
                className="contact-btn cart-drawer-checkout"
                onClick={closeDrawer}
              >
                Checkout
              </Link>
              <Link
                to="/cart"
                className="cart-drawer-viewall"
                onClick={closeDrawer}
              >
                View full cart
              </Link>
            </footer>
          )}
        </aside>
      </div>

      {editingItem && (
        <CartItemEditor
          item={editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}
    </>
  );
}

export default CartDrawer;
