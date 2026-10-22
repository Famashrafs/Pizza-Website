import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPenToSquare,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { formatAddress, getEstimatedTime } from '../../utils/checkoutLogic';
import { getPaymentMethod } from '../../services/paymentService';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import OrderSummaryPanel from './OrderSummaryPanel';
import { PAYMENT_METHOD_LABEL_KEYS } from '../../utils/checkoutLogic';

function ReviewBlock({ title, stepId, onEdit, children, editLabel }) {
  const { t } = useTranslation();
  return (
    <div className="review-block">
      <div className="review-block-head">
        <h3>{title}</h3>
        <button type="button" className="review-edit" onClick={() => onEdit(stepId)}>
          <FontAwesomeIcon icon={faPenToSquare} /> {editLabel || t('common.actions.edit')}
        </button>
      </div>
      <div className="review-block-body">{children}</div>
    </div>
  );
}

function ReviewStep({
  customer,
  fulfillmentType,
  address,
  paymentMethod,
  notes,
  onNotesChange,
  items,
  totals,
  promoCode,
  onEditStep,
  availabilityIssues = [],
  priceChanges = [],
  submitting = false,
  onPlaceOrder,
  orderError = '',
  pricingReady = true,
}) {
  const { t } = useTranslation();
  const payment = getPaymentMethod(paymentMethod);
  const currency = RESTAURANT_SETTINGS.currency;
  const paymentLabel = payment
    ? (PAYMENT_METHOD_LABEL_KEYS[payment.id] ? t(PAYMENT_METHOD_LABEL_KEYS[payment.id]) : payment.label)
    : t('checkout.notSelected');
  const methodLabel = t(fulfillmentType === 'pickup' ? 'checkout.fulfillmentPickup' : 'checkout.fulfillmentDelivery');
  const methodLower = fulfillmentType === 'pickup' ? 'pickup' : 'delivery';

  return (
    <section className="checkout-section" aria-labelledby="checkout-review-title">
      <h2 id="checkout-review-title">{t('checkout.reviewTitle')}</h2>
      <p className="checkout-section-sub">
        {t('checkout.reviewSubtitle')}
      </p>

      {orderError && (
        <p className="checkout-banner checkout-banner--error" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {orderError}
        </p>
      )}

      {priceChanges.length > 0 && (
        <div className="checkout-banner checkout-banner--warning" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <div>
            <strong>{t('checkout.pricesChangedTitle')}</strong>
            <ul>
              {priceChanges.map((change) => (
                <li key={change.id}>
                  {change.name} — {currency}
                  {change.oldPrice.toFixed(2)} → {currency}
                  {change.newPrice.toFixed(2)}
                </li>
              ))}
            </ul>
            <small>
              {t('checkout.pricesChangedNote')}
            </small>
          </div>
        </div>
      )}

      {availabilityIssues.length > 0 && (
        <div className="checkout-banner checkout-banner--warning" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <div>
            <strong>{t('checkout.unavailableItemsTitle')}</strong>
            <ul>
              {availabilityIssues.map((issue) => (
                <li key={issue.id}>
                  {issue.name} — {issue.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ReviewBlock title={t('checkout.reviewCustomerTitle')} stepId="details" onEdit={onEditStep}>
        <p>{customer.fullName}</p>
        <p>{customer.email}</p>
        <p>{customer.phone}</p>
      </ReviewBlock>

      <ReviewBlock
        title={methodLabel}
        stepId="delivery"
        onEdit={onEditStep}
      >
        {fulfillmentType === 'pickup' ? (
          <p>{RESTAURANT_SETTINGS.pickup.address}</p>
        ) : (
          <>
            <p>{formatAddress(address)}</p>
            <p>{address.phone}</p>
          </>
        )}
        <p className="review-muted">
          {t('checkout.estimatedFulfillment', {
            method: fulfillmentType === 'pickup' ? t('checkout.fulfillmentPickup').toLowerCase() : t('checkout.fulfillmentDelivery').toLowerCase(),
            time: getEstimatedTime(fulfillmentType),
          })}
        </p>
      </ReviewBlock>

      <ReviewBlock title={t('checkout.reviewPaymentTitle')} stepId="payment" onEdit={onEditStep}>
        <p>{paymentLabel}</p>
        <p className="review-muted">{t('checkout.paymentPendingNote')}</p>
      </ReviewBlock>

      <div className="review-notes">
        <label htmlFor="order-notes">{t('checkout.orderNotesLabel')}</label>
        <textarea
          id="order-notes"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder={t('checkout.orderNotesPlaceholder')}
        />
      </div>

      <OrderSummaryPanel
        items={items}
        totals={totals}
        fulfillmentType={fulfillmentType}
        className="order-summary-panel--inline"
      />

      <p className="review-muted">
        {t('checkout.estimatedTotalNote')}
      </p>

      <button
        type="button"
        className="contact-btn checkout-place-order"
        onClick={onPlaceOrder}
        disabled={submitting || availabilityIssues.length > 0 || !pricingReady}
      >
        {submitting
          ? t('checkout.placingOrder')
          : !pricingReady
          ? t('checkout.confirmingPrices')
          : t('checkout.placeOrderWithAmount', {
              amount: `${currency}${Number(totals?.total || 0).toFixed(2)}`,
            })}
      </button>
    </section>
  );
}

export default ReviewStep;
