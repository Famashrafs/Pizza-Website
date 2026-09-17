import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoneyBillWave, faCreditCard, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { getPaymentMethods } from '../../services/paymentService';

const ICONS = {
  cash: faMoneyBillWave,
  card: faCreditCard,
  online: faGlobe,
};

function PaymentStep({ selected, onChange, error }) {
  const methods = getPaymentMethods();

  return (
    <section className="checkout-section" aria-labelledby="checkout-payment-title">
      <h2 id="checkout-payment-title">Payment Method</h2>
      <p className="checkout-section-sub">
        Choose how you would like to pay. Online payments are on the way.
      </p>

      {error && (
        <p className="checkout-error-text" role="alert">
          {error}
        </p>
      )}

      <div className="payment-options" role="radiogroup" aria-label="Payment method">
        {methods.map((method) => {
          const disabled = !method.enabled;
          return (
            <label
              key={method.id}
              className={`choice-card payment-option ${
                selected === method.id ? 'is-selected' : ''
              } ${disabled ? 'is-disabled' : ''}`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={method.id}
                checked={selected === method.id}
                disabled={disabled}
                onChange={() => onChange(method.id)}
              />
              <span className="choice-card-icon">
                <FontAwesomeIcon icon={ICONS[method.id] || faMoneyBillWave} />
              </span>
              <span className="choice-card-body">
                <strong>
                  {method.label}
                  {method.comingSoon && (
                    <span className="choice-card-badge">Coming soon</span>
                  )}
                </strong>
                <small>{method.description}</small>
              </span>
            </label>
          );
        })}
      </div>

      <p className="checkout-hint">
        No payment is taken now. For cash orders you pay on delivery or pickup.
      </p>
    </section>
  );
}

export default PaymentStep;
