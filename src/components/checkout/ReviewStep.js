import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPenToSquare,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { formatAddress, getEstimatedTime } from '../../utils/checkoutLogic';
import { getPaymentMethod } from '../../services/paymentService';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import OrderSummaryPanel from './OrderSummaryPanel';

function ReviewBlock({ title, stepId, onEdit, children }) {
  return (
    <div className="review-block">
      <div className="review-block-head">
        <h3>{title}</h3>
        <button type="button" className="review-edit" onClick={() => onEdit(stepId)}>
          <FontAwesomeIcon icon={faPenToSquare} /> Edit
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
  submitting = false,
  onPlaceOrder,
  orderError = '',
}) {
  const payment = getPaymentMethod(paymentMethod);

  return (
    <section className="checkout-section" aria-labelledby="checkout-review-title">
      <h2 id="checkout-review-title">Review Your Order</h2>
      <p className="checkout-section-sub">
        Please confirm everything looks right before placing your order.
      </p>

      {orderError && (
        <p className="checkout-banner checkout-banner--error" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} /> {orderError}
        </p>
      )}

      {availabilityIssues.length > 0 && (
        <div className="checkout-banner checkout-banner--warning" role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <div>
            <strong>Some items are no longer available:</strong>
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

      <ReviewBlock title="Customer" stepId="details" onEdit={onEditStep}>
        <p>{customer.fullName}</p>
        <p>{customer.email}</p>
        <p>{customer.phone}</p>
      </ReviewBlock>

      <ReviewBlock
        title={fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'}
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
          Estimated {fulfillmentType === 'pickup' ? 'pickup' : 'delivery'}:{' '}
          {getEstimatedTime(fulfillmentType)}
        </p>
      </ReviewBlock>

      <ReviewBlock title="Payment" stepId="payment" onEdit={onEditStep}>
        <p>{payment ? payment.label : 'Not selected'}</p>
        <p className="review-muted">Pending — no payment taken yet</p>
      </ReviewBlock>

      <div className="review-notes">
        <label htmlFor="order-notes">Order notes (optional)</label>
        <textarea
          id="order-notes"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Allergies, gate codes, delivery instructions…"
        />
      </div>

      <OrderSummaryPanel
        items={items}
        totals={totals}
        fulfillmentType={fulfillmentType}
        className="order-summary-panel--inline"
      />

      <button
        type="button"
        className="contact-btn checkout-place-order"
        onClick={onPlaceOrder}
        disabled={submitting || availabilityIssues.length > 0}
      >
        {submitting
          ? 'Placing order…'
          : `Place Order · ${RESTAURANT_SETTINGS.currency}${totals.total.toFixed(2)}`}
      </button>
    </section>
  );
}

export default ReviewStep;
