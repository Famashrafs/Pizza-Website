import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationDot, faStar } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

function AddressCard({ address, onEdit, onSetDefault, onRemove }) {
  const { t } = useTranslation();

  return (
    <div className="dash-address-card">
      <span className="dash-address-icon">
        <FontAwesomeIcon icon={faLocationDot} />
      </span>
      <div className="dash-address-info">
        <p className="dash-address-label">
          {address.label}
          {address.isDefault && (
            <span className="dash-payment-default">
              <FontAwesomeIcon icon={faStar} /> {t('account.defaultBadge')}
            </span>
          )}
        </p>
        <p className="dash-address-text">
          {address.address || t('account.seeSavedFields')}
        </p>
        {address.fields?.phone && (
          <p className="dash-address-phone">📞 {address.fields.phone}</p>
        )}
      </div>
      <div className="dash-address-actions">
        <button
          type="button"
          className="menu-btn dash-btn-xs"
          onClick={() => onEdit(address)}
        >
          {t('common.actions.edit')}
        </button>
        {!address.isDefault && (
          <button
            type="button"
            className="menu-btn dash-btn-xs"
            onClick={() => onSetDefault(address.id)}
          >
            {t('account.setDefault')}
          </button>
        )}
        <button
          type="button"
          className="menu-btn dash-btn-xs is-danger"
          onClick={() => onRemove(address)}
        >
          {t('common.actions.delete')}
        </button>
      </div>
    </div>
  );
}

export default AddressCard;
