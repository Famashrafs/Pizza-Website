import React from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTruckFast, faStore, faClock, faLocationDot, faPhone } from '@fortawesome/free-solid-svg-icons';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import { FULFILLMENT_TYPES, getEstimatedTime } from '../../utils/checkoutLogic';
import AddressForm from './AddressForm';

function FulfillmentStep({
  fulfillmentType,
  onFulfillmentChange,
  address,
  onAddressChange,
  errors = {},
  saveAddress,
  onSaveChange,
}) {
  const { t } = useTranslation();
  return (
    <section className="checkout-section" aria-labelledby="checkout-delivery-title">
      <h2 id="checkout-delivery-title">{t('checkout.fulfillmentTitle')}</h2>
      <p className="checkout-section-sub">
        {t('checkout.fulfillmentSubtitle')}
      </p>

      <div className="fulfillment-options" role="radiogroup" aria-label={t('checkout.ariaFulfillmentMethod')}>
        {FULFILLMENT_TYPES.map((option) => {
          const selected = fulfillmentType === option.id;
          return (
            <label
              key={option.id}
              className={`choice-card ${selected ? 'is-selected' : ''}`}
            >
              <input
                type="radio"
                name="fulfillmentType"
                value={option.id}
                checked={selected}
                onChange={() => onFulfillmentChange(option.id)}
              />
              <span className="choice-card-icon">
                <FontAwesomeIcon icon={option.id === 'pickup' ? faStore : faTruckFast} />
              </span>
              <span className="choice-card-body">
                <strong>{t(option.labelKey)}</strong>
                <small>{t(option.descriptionKey)}</small>
                <span className="choice-card-meta">
                  <FontAwesomeIcon icon={faClock} /> {getEstimatedTime(option.id)}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {fulfillmentType === 'pickup' ? (
        <div className="pickup-info">
          <h3>{t('checkout.pickupDetailsTitle')}</h3>
          <p>
            <FontAwesomeIcon icon={faLocationDot} /> {RESTAURANT_SETTINGS.pickup.address}
          </p>
          <p>
            <FontAwesomeIcon icon={faPhone} /> {RESTAURANT_SETTINGS.phone}
          </p>
          <p>
            <FontAwesomeIcon icon={faClock} /> {RESTAURANT_SETTINGS.pickup.hours}
          </p>
          <p className="pickup-eta">
            {t('checkout.estimatedPickupTime')} <strong>{getEstimatedTime('pickup')}</strong>
          </p>
        </div>
      ) : (
        <div className="checkout-delivery-address">
          <h3>{t('checkout.deliveryAddressTitle')}</h3>
          <AddressForm
            address={address}
            onChange={onAddressChange}
            errors={errors}
            showSave
            saveAddress={saveAddress}
            onSaveChange={onSaveChange}
          />
        </div>
      )}
    </section>
  );
}

export default FulfillmentStep;
