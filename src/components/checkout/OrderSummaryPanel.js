import React from 'react';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';

function OrderSummaryPanel({ items = [], totals, fulfillmentType, className = '' }) {
  const currency = RESTAURANT_SETTINGS.currency;
  // Defensive defaults: a missing/partial totals object renders as zero rather
  // than throwing (the panel can mount before settings finish loading).
  const t = {
    subtotal: 0,
    discount: 0,
    deliveryFee: 0,
    tax: 0,
    taxRate: 0,
    total: 0,
    freeDelivery: false,
    ...(totals || {}),
  };

  return (
    <div className={`order-summary-panel ${className}`.trim()}>
      <h3>Order Summary</h3>

      <div className="order-summary-items">
        {items.map((item) => (
          <div className="order-summary-item" key={item.id}>
            <div className="order-summary-item-main">
              <span className="order-summary-qty">{item.qty}×</span>
              <div>
                <p className="order-summary-name">{item.name}</p>
                {item.desc && <small>{item.desc}</small>}
                {item.instructions && (
                  <small className="order-summary-note">
                    Note: “{item.instructions}”
                  </small>
                )}
              </div>
            </div>
            <span className="order-summary-price">
              {currency}
              {(item.lineTotal ?? item.price * item.qty).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="order-summary-lines">
        <div className="order-summary-line">
          <span>Subtotal</span>
          <span>{currency}{Number(t.subtotal).toFixed(2)}</span>
        </div>
        {t.discount > 0 && (
          <div className="order-summary-line order-summary-line--discount">
            <span>Discount{t.promoCode ? ` (${t.promoCode})` : ''}</span>
            <span>-{currency}{Number(t.discount).toFixed(2)}</span>
          </div>
        )}
        <div className="order-summary-line">
          <span>Delivery fee</span>
          <span>
            {fulfillmentType === 'pickup'
              ? 'Pickup'
              : t.freeDelivery
              ? 'Free'
              : `${currency}${Number(t.deliveryFee).toFixed(2)}`}
          </span>
        </div>
        <div className="order-summary-line">
          <span>Tax ({Math.round((t.taxRate || 0) * 100)}%)</span>
          <span>{currency}{Number(t.tax).toFixed(2)}</span>
        </div>
        <div className="order-summary-line order-summary-line--total">
          <span>Total</span>
          <span>{currency}{Number(t.total).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export default OrderSummaryPanel;
