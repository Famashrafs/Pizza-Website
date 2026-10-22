import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import { formatDateTime, formatMoney } from '../../i18n/format';

function OrderCard({ order, onReorder, onCancel, busy }) {
  const { t, i18n } = useTranslation();
  const canCancel = order.canCancel && !order.isCancelled;
  const itemSummary = order.items
    .map((item) => `${item.name} ×${item.qty}`)
    .join(', ');

  const statusLabel = t(order.statusMeta.labelKey, {
    defaultValue: order.statusMeta.label,
  });
  const paymentLabel = t(order.paymentMeta.labelKey, {
    defaultValue: order.paymentMeta.label,
  });

  return (
    <div className="order-card" key={order.id}>
      <div className="order-head">
        <h4>{order.id}</h4>
        <p>
          {formatDateTime(order.createdAt || order.placedAt, i18n.language)}
        </p>
      </div>

      <div className="order-meta">
        <span
          className={`order-status-badge ${
            order.isCancelled ? 'is-cancelled' : `is-${order.statusMeta.tone}`
          }`}
        >
          {statusLabel}
        </span>
        <span
          className={`order-payment-badge is-${order.paymentMeta.tone}`}
          title={t('orders.paymentBadgeTitle', { status: paymentLabel })}
        >
          {paymentLabel}
        </span>
        <span className="order-meta-method">
          {order.fulfillmentType === 'pickup'
            ? t('orders.pickup')
            : t('orders.delivery')}
        </span>
      </div>

      <p className="order-items">{itemSummary}</p>

      <div className="order-foot">
        <p>
          <span>
            {order.fulfillmentType === 'pickup'
              ? t('orders.pickupAt')
              : t('orders.deliverTo')}
          </span>{' '}
          {order.addressText ||
            (order.fulfillmentType === 'pickup'
              ? RESTAURANT_SETTINGS.pickup.address
              : order.address)}
        </p>
        <p className="order-total">
          {t('orders.totalLabel')}{' '}
          <span>{formatMoney(Number(order.total || 0), i18n.language)}</span>
        </p>
      </div>

      <div className="order-card-actions">
        <Link to={`/orders/${order.id}`} className="menu-btn">
          {t('orders.trackOrder')}
        </Link>
        <button
          type="button"
          className="menu-btn"
          onClick={() => onReorder(order)}
          disabled={busy}
        >
          {busy ? t('orders.working') : t('orders.orderAgain')}
        </button>
        {canCancel && (
          <button
            type="button"
            className="menu-btn is-danger"
            onClick={() => onCancel(order)}
            disabled={busy}
          >
            {t('orders.cancelOrder')}
          </button>
        )}
      </div>
    </div>
  );
}

export default OrderCard;
