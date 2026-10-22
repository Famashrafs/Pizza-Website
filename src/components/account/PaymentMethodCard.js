import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCreditCard, faStar } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { maskCardNumber } from '../../services/accountService';

function PaymentMethodCard({ method, onSetDefault, onRemove }) {
  const { t } = useTranslation();
  const expires =
    method.expMonth && method.expYear
      ? `${String(method.expMonth).padStart(2, '0')}/${String(
          method.expYear
        ).slice(-2)}`
      : '—';

  return (
    <div className="dash-payment-card">
      <span className="dash-payment-icon">
        <FontAwesomeIcon icon={faCreditCard} />
      </span>
      <div className="dash-payment-info">
        <p className="dash-payment-brand">{method.brand || t('account.cardFallback')}</p>
        <p className="dash-payment-number">
          {maskCardNumber(method.brand, method.last4)}
        </p>
        <p className="dash-payment-expiry">
          {t('account.expiresOn', { date: expires })}
        </p>
      </div>
      <div className="dash-payment-actions">
        {method.isDefault ? (
          <span className="dash-payment-default">
            <FontAwesomeIcon icon={faStar} /> {t('account.defaultBadge')}
          </span>
        ) : (
          <button
            type="button"
            className="menu-btn dash-btn-xs"
            onClick={() => onSetDefault(method.id)}
          >
            {t('account.setDefault')}
          </button>
        )}
        <button
          type="button"
          className="menu-btn dash-btn-xs is-danger"
          onClick={() => onRemove(method)}
        >
          {t('common.actions.remove')}
        </button>
      </div>
    </div>
  );
}

export default PaymentMethodCard;
