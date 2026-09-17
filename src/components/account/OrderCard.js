import React from 'react';
import { Link } from 'react-router-dom';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';

function OrderCard({ order, onReorder, onCancel, busy }) {
  const canCancel = order.canCancel && !order.isCancelled;
  const itemSummary = order.items
    .map((item) => `${item.name} ×${item.qty}`)
    .join(', ');

  return (
    <div className="order-card" key={order.id}>
      <div className="order-head">
        <h4>{order.id}</h4>
        <p>{new Date(order.createdAt || order.placedAt).toLocaleString()}</p>
      </div>

      <div className="order-meta">
        <span
          className={`order-status-badge ${
            order.isCancelled ? 'is-cancelled' : `is-${order.statusMeta.tone}`
          }`}
        >
          {order.statusMeta.label}
        </span>
        <span
          className={`order-payment-badge is-${order.paymentMeta.tone}`}
          title={`Payment: ${order.paymentMeta.label}`}
        >
          {order.paymentMeta.label}
        </span>
        <span className="order-meta-method">
          {order.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'}
        </span>
      </div>

      <p className="order-items">{itemSummary}</p>

      <div className="order-foot">
        <p>
          <span>
            {order.fulfillmentType === 'pickup' ? 'Pickup at:' : 'Deliver to:'}
          </span>{' '}
          {order.addressText ||
            (order.fulfillmentType === 'pickup'
              ? RESTAURANT_SETTINGS.pickup.address
              : order.address)}
        </p>
        <p className="order-total">
          Total:{' '}
          <span>
            {RESTAURANT_SETTINGS.currency}
            {Number(order.total || 0).toFixed(2)}
          </span>
        </p>
      </div>

      <div className="order-card-actions">
        <Link to={`/orders/${order.id}`} className="menu-btn">
          Track Order
        </Link>
        <button
          type="button"
          className="menu-btn"
          onClick={() => onReorder(order)}
          disabled={busy}
        >
          {busy ? 'Working…' : 'Order Again'}
        </button>
        {canCancel && (
          <button
            type="button"
            className="menu-btn is-danger"
            onClick={() => onCancel(order)}
            disabled={busy}
          >
            Cancel Order
          </button>
        )}
      </div>
    </div>
  );
}

export default OrderCard;