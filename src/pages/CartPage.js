import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatMoney } from '../i18n/format';
import CartLine from '../components/CartLine';
import CartItemEditor from '../components/CartItemEditor';
import ConfirmDialog from '../components/ConfirmDialog';

function CartPage() {
  const { t, i18n } = useTranslation();
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
    showToast(t('cart.toastRemoved', { name: item.name }));
  };

  const handleApplyPromo = (event) => {
    event.preventDefault();
    const result = applyPromo(promoInput);
    showToast(
      result.success ? t('cart.toastPromoApplied') : t('cart.toastPromoInvalid'),
      result.success ? 'success' : 'error'
    );
    if (result.success) setPromoInput('');
  };

  const handleConfirmClear = () => {
    clearCart();
    setConfirmClear(false);
    showToast(t('cart.toastCleared'));
  };

  if (items.length === 0) {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">{t('cart.pageTitle')}</h1>
        </div>
        <div className="cart-empty">
          <p className="cart-empty-emoji" aria-hidden="true">
            🍕
          </p>
          <h2>{t('cart.emptyTitle')}</h2>
          <p>{t('cart.emptyPageText')}</p>
          <Link to="/menu" className="contact-btn cart-empty-btn">
            {t('cart.exploreMenu')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">{t('cart.pageTitle')}</h1>
      </div>

      <div className="cart-layout">
        <section className="cart-items" aria-label={t('cart.ariaCartItems')}>
          <div className="cart-items-head">
            <h2>{t('cart.itemsInCart', { count })}</h2>
            <button
              type="button"
              className="cart-clear"
              onClick={() => setConfirmClear(true)}
            >
              {t('cart.clearCart')}
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

        <aside className="cart-summary-panel" aria-label={t('cart.ariaOrderSummary')}>
          <h2>{t('cart.orderSummary')}</h2>

          <div className="summary-line">
            <span>{t('cart.subtotal')}</span>
            <span>{formatMoney(subtotal, i18n.language)}</span>
          </div>

          {discount > 0 && (
            <div className="summary-line summary-line--discount">
              <span>
                {promoCode
                  ? t('cart.discountWithCode', { code: promoCode })
                  : t('cart.discount')}
              </span>
              <span>
                {t('cart.negativeAmount', {
                  amount: formatMoney(discount, i18n.language),
                })}
              </span>
            </div>
          )}

          <div className="summary-line">
            <span>{t('cart.deliveryFee')}</span>
            <span>
              {freeDelivery
                ? t('cart.free')
                : formatMoney(deliveryFee, i18n.language)}
            </span>
          </div>

          <div className="summary-line">
            <span>{t('cart.tax', { rate: Math.round((taxRate || 0) * 100) })}</span>
            <span>{formatMoney(tax, i18n.language)}</span>
          </div>

          <div className="summary-line summary-line--total">
            <span>{t('cart.grandTotal')}</span>
            <span>{formatMoney(grandTotal, i18n.language)}</span>
          </div>

          <form className="promo-form" onSubmit={handleApplyPromo}>
            <label htmlFor="promo-code">{t('cart.promoCode')}</label>
            <div className="promo-row">
              <input
                id="promo-code"
                type="text"
                value={promoInput}
                placeholder="PIZZA10"
                onChange={(event) => setPromoInput(event.target.value)}
              />
              <button type="submit">{t('common.actions.apply')}</button>
            </div>
            {promoCode && (
              <p className="promo-applied">
                <span>{discountLabel || t('cart.codeApplied', { code: promoCode })}</span>
                <button type="button" onClick={clearPromo}>
                  {t('common.actions.remove')}
                </button>
              </p>
            )}
          </form>

          <Link to="/checkout" className="contact-btn cart-checkout-btn">
            {t('cart.proceedToCheckout')}
          </Link>
          <Link to="/menu" className="cart-continue">
            {t('cart.continueShopping')}
          </Link>
        </aside>
      </div>

      {confirmClear && (
        <ConfirmDialog
          title={t('cart.clearCartTitle')}
          message={t('cart.clearCartMessage')}
          confirmLabel={t('cart.clearCart')}
          cancelLabel={t('cart.keepItems')}
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
