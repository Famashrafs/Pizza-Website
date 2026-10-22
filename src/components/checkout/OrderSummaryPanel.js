import React from 'react';
import { useTranslation } from 'react-i18next';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';

function OrderSummaryPanel({ items = [], totals, fulfillmentType, className = '' }) {
  const { t } = useTranslation();
  const currency = RESTAURANT_SETTINGS.currency;
  // Defensive defaults: a missing/partial totals object renders as zero rather
  // than throwing (the panel can mount before settings finish loading).
  const summary = {
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
      <h3>{t('checkout.orderSummary')}</h3>

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
                    {t('checkout.itemNote', { note: item.instructions })}
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
          <span>{t('checkout.subtotal')}</span>
          <span>{currency}{Number(summary.subtotal).toFixed(2)}</span>
        </div>
        {summary.discount > 0 && (
          <div className="order-summary-line order-summary-line--discount">
            <span>
              {summary.promoCode
                ? t('checkout.discountWithCode', { code: summary.promoCode })
                : t('checkout.discount')}
            </span>
            <span>
              {t('checkout.negativeAmount', {
                amount: `${currency}${Number(summary.discount).toFixed(2)}`,
              })}
            </span>
          </div>
        )}
        <div className="order-summary-line">
          <span>{t('checkout.deliveryFee')}</span>
          <span>
            {fulfillmentType === 'pickup'
              ? t('checkout.fulfillmentPickup')
              : summary.freeDelivery
              ? t('checkout.free')
              : `${currency}${Number(summary.deliveryFee).toFixed(2)}`}
          </span>
        </div>
        <div className="order-summary-line">
          <span>{t('checkout.taxWithRate', { rate: Math.round((summary.taxRate || 0) * 100) })}</span>
          <span>{currency}{Number(summary.tax).toFixed(2)}</span>
        </div>
        <div className="order-summary-line order-summary-line--total">
          <span>{t('checkout.total')}</span>
          <span>{currency}{Number(summary.total).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export default OrderSummaryPanel;
