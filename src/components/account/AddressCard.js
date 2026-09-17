import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationDot, faStar } from '@fortawesome/free-solid-svg-icons';

function AddressCard({ address, onEdit, onSetDefault, onRemove }) {
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
              <FontAwesomeIcon icon={faStar} /> Default
            </span>
          )}
        </p>
        <p className="dash-address-text">
          {address.address || 'See saved fields'}
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
          Edit
        </button>
        {!address.isDefault && (
          <button
            type="button"
            className="menu-btn dash-btn-xs"
            onClick={() => onSetDefault(address.id)}
          >
            Set Default
          </button>
        )}
        <button
          type="button"
          className="menu-btn dash-btn-xs is-danger"
          onClick={() => onRemove(address)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default AddressCard;