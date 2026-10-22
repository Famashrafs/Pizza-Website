import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useOrder } from '../hooks/useOrder';
import { reorder, cancelOrder } from '../services/orderService';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import OrderStatusTracker from '../components/OrderStatusTracker';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatAddress } from '../utils/checkoutLogic';
import { RESTAURANT_SETTINGS } from '../config/restaurant';
import { formatDateTime, formatMoney } from '../i18n/format';

function OrderDetails() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const { status, order, error, reload } = useOrder(id, uid);
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === 'loading') {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">{t('orders.trackTitle')}</h1>
        </div>
        <div className="order-detail order-detail--skeleton" />
      </div>
    );
  }

  if (status === 'notfound' || !order) {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">{t('orders.orderTitle')}</h1>
        </div>
        <div className="auth-card">
          <h2>{t('orders.notFoundTitle')}</h2>
          <p className="auth-subtitle">
            {t('orders.notFoundText')}
          </p>
          <Link to="/orders" className="contact-btn empty-cart-btn">
            {t('orders.viewOrders')}
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">{t('orders.trackTitle')}</h1>
        </div>
        <div className="auth-card empty-cart">
          <h2>{t('orders.errorTitle')}</h2>
          <p className="auth-subtitle">{error}</p>
          <button type="button" className="contact-btn empty-cart-btn" onClick={reload}>
            {t('common.actions.retry')}
          </button>
        </div>
      </div>
    );
  }

  const isPickup = order.fulfillmentType === 'pickup';
  const canCancel = order.canCancel && !order.isCancelled;

  // The stored payment method key is data; only the label shown next to it is
  // translated, with the raw key kept as the fallback for unknown methods.
  const paymentMethodLabel =
    order.paymentMethod === 'cash'
      ? t('orders.paymentMethodCash')
      : order.paymentMethod === 'card'
      ? t('orders.paymentMethodCard')
      : order.paymentMethod === 'online'
      ? t('orders.paymentMethodOnline')
      : order.paymentMethod;

  const handleReorder = async () => {
    setBusy(true);
    try {
      const { items, unavailable } = await reorder(order);
      items.forEach((item) => addItem(item));
      if (unavailable.length) {
        showToast(
          t('orders.toastItemsSkipped', { count: unavailable.length }),
          'warning'
        );
      } else {
        showToast(t('orders.toastItemsAdded'));
      }
    } catch (err) {
      showToast(t('orders.toastReorderFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setConfirmingCancel(false);
    setBusy(true);
    try {
      const result = await cancelOrder(order.id, uid);
      if (result.success) {
        showToast(t('orders.toastCancelled'));
        reload();
      } else {
        showToast(result.error || t('orders.toastCancelFailed'), 'error');
      }
    } catch (err) {
      showToast(t('orders.toastCancelFailedRetry'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">{t('orders.trackTitle')}</h1>
      </div>

      <div className="order-detail">
        <div className="order-detail-head">
          <div>
            <h2>{order.id}</h2>
            <p>
              {t('orders.placedOn', {
                date: formatDateTime(
                  order.createdAt || order.placedAt,
                  i18n.language
                ),
              })}
            </p>
          </div>
          <span
            className={`order-status-badge ${
              order.isCancelled ? 'is-cancelled' : `is-${order.statusMeta.tone}`
            }`}
          >
            {t(order.statusMeta.labelKey, {
              defaultValue: order.statusMeta.label,
            })}
          </span>
        </div>

        <OrderStatusTracker order={order} />

        <div className="order-detail-grid">
          <div className="order-detail-panel">
            <h3>
              {isPickup
                ? t('orders.pickupDetails')
                : t('orders.deliveryDetails')}
            </h3>
            {isPickup ? (
              <p>{RESTAURANT_SETTINGS.pickup.address}</p>
            ) : (
              <p>{order.addressText || formatAddress(order.address)}</p>
            )}
            <p className="review-muted">
              {t('orders.estimated', { time: order.estimatedTime || '' })}
            </p>
            {order.customerNotes && (
              <p className="review-muted">
                {t('orders.notes', { notes: order.customerNotes })}
              </p>
            )}
            <p className="review-muted">
              {t('orders.customerName', {
                name: order.customer?.fullName || '-',
              })}
            </p>
            <p className="review-muted">
              {t('orders.customerPhone', {
                phone: order.customer?.phone || '-',
              })}
            </p>
          </div>

          <div className="order-detail-panel">
            <h3>{t('orders.payment')}</h3>
            <p style={{ textTransform: 'capitalize' }}>{paymentMethodLabel}</p>
            <p className="review-muted" style={{ textTransform: 'capitalize' }}>
              {t('orders.paymentStatusLabel')}{' '}
              <span className={`order-payment-badge is-${order.paymentMeta.tone}`}>
                {t(order.paymentMeta.labelKey, {
                  defaultValue: order.paymentMeta.label,
                })}
              </span>
            </p>
          </div>
        </div>

        <div className="order-detail-panel">
          <h3>{t('orders.items')}</h3>
          {order.items.map((item) => (
            <div className="order-summary-item" key={item.id}>
              <div className="order-summary-item-main">
                <span className="order-summary-qty">{item.qty}×</span>
                <div>
                  <p className="order-summary-name">{item.name}</p>
                  {item.desc && <small>{item.desc}</small>}
                </div>
              </div>
              <span className="order-summary-price">
                {formatMoney(item.lineTotal ?? item.price * item.qty, i18n.language)}
              </span>
            </div>
          ))}

          <div className="order-summary-lines">
            <div className="order-summary-line">
              <span>{t('orders.subtotal')}</span>
              <span>{formatMoney(Number(order.subtotal || 0), i18n.language)}</span>
            </div>
            {Number(order.discount) > 0 && (
              <div className="order-summary-line order-summary-line--discount">
                <span>{t('orders.discount')}</span>
                <span>-{formatMoney(Number(order.discount), i18n.language)}</span>
              </div>
            )}
            <div className="order-summary-line">
              <span>{t('orders.deliveryFee')}</span>
              <span>
                {isPickup
                  ? t('orders.pickup')
                  : Number(order.deliveryFee) > 0
                  ? formatMoney(Number(order.deliveryFee), i18n.language)
                  : t('orders.free')}
              </span>
            </div>
            <div className="order-summary-line">
              <span>{t('orders.tax')}</span>
              <span>{formatMoney(Number(order.tax || 0), i18n.language)}</span>
            </div>
            <div className="order-summary-line order-summary-line--total">
              <span>{t('orders.total')}</span>
              <span>{formatMoney(Number(order.total || 0), i18n.language)}</span>
            </div>
          </div>
        </div>

        <div className="order-detail-actions">
          <Link to="/orders" className="menu-btn">
            {t('orders.allOrders')}
          </Link>
          <button
            type="button"
            className="menu-btn"
            onClick={handleReorder}
            disabled={busy}
          >
            {busy ? t('orders.working') : t('orders.orderAgain')}
          </button>
          {canCancel && (
            <button
              type="button"
              className="menu-btn is-danger"
              onClick={() => setConfirmingCancel(true)}
              disabled={busy}
            >
              {t('orders.cancelOrder')}
            </button>
          )}
          <Link to="/menu" className="contact-btn">
            {t('orders.continueShopping')}
          </Link>
        </div>
      </div>

      {confirmingCancel && (
        <ConfirmDialog
          title={t('orders.cancelDialogTitle')}
          message={t('orders.cancelDialogMessage', { id: order.id })}
          confirmLabel={t('orders.cancelOrder')}
          danger
          onConfirm={handleCancel}
          onCancel={() => setConfirmingCancel(false)}
        />
      )}
    </div>
  );
}

export default OrderDetails;