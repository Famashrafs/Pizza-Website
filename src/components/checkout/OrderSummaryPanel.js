import React from 'react';

function OrderSummaryPanel({ items, totals, fulfillmentType, className = '' }) {
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
              ${(item.lineTotal ?? item.price * item.qty).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="order-summary-lines">
        <div className="order-summary-line">
          <span>Subtotal</span>
          <span>${totals.subtotal.toFixed(2)}</span>
        </div>
        {totals.discount > 0 && (
          <div className="order-summary-line order-summary-line--discount">
            <span>Discount{totals.promoCode ? ` (${totals.promoCode})` : ''}</span>
            <span>-${totals.discount.toFixed(2)}</span>
          </div>
        )}
        <div className="order-summary-line">
          <span>Delivery fee</span>
          <span>
            {fulfillmentType === 'pickup'
              ? 'Pickup'
              : totals.freeDelivery
              ? 'Free'
              : `$${totals.deliveryFee.toFixed(2)}`}
          </span>
        </div>
        <div className="order-summary-line">
          <span>Tax ({Math.round((totals.taxRate || 0) * 100)}%)</span>
          <span>${totals.tax.toFixed(2)}</span>
        </div>
        <div className="order-summary-line order-summary-line--total">
          <span>Total</span>
          <span>${totals.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export default OrderSummaryPanel;
