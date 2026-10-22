import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoneyBillWave, faCreditCard, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { getPaymentMethods } from '../../services/paymentService';
import { PAYMENT_METHOD_DESCRIPTION_KEYS, PAYMENT_METHOD_LABEL_KEYS } from '../../utils/checkoutLogic';

const ICONS = {
  cash: faMoneyBillWave,
  card: faCreditCard,
  online: faGlobe,
};

function PaymentStep({ selected, onChange, error }) {
  const { t } = useTranslation();
  const methods = getPaymentMethods();

  return (
    <section className="checkout-section" aria-labelledby="checkout-payment-title">
      <h2 id="checkout-payment-title">{t('checkout.paymentTitle')}</h2>
      <p className="checkout-section-sub">
        {t('checkout.paymentSubtitle')}
      </p>

      {error && (
        <p className="checkout-error-text" role="alert">
          {error}
        </p>
      )}

      <div className="payment-options" role="radiogroup" aria-label={t('checkout.ariaPaymentMethod')}>
        {methods.map((method) => {
          const disabled = !method.enabled;
          const labelKey = PAYMENT_METHOD_LABEL_KEYS[method.id];
          const descKey = PAYMENT_METHOD_DESCRIPTION_KEYS[method.id];
          const label = labelKey ? t(labelKey) : method.label;
          const description = descKey ? t(descKey) : method.description;
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
                  {label}
                  {method.comingSoon && (
                    <span className="choice-card-badge">{t('checkout.comingSoon')}</span>
                  )}
                </strong>
                <small>{description}</small>
              </span>
            </label>
          );
        })}
      </div>

      <p className="checkout-hint">
        {t('checkout.paymentHint')}
      </p>
    </section>
  );
}

export default PaymentStep;
