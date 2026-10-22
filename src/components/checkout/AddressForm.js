import React from 'react';
import { useTranslation } from 'react-i18next';
import FormField from './FormField';

function AddressForm({ address, onChange, errors = {}, showSave = false, saveAddress = false, onSaveChange }) {
  const { t } = useTranslation();
  return (
    <div className="checkout-address">
      <FormField
        id="street"
        label={t('checkout.fieldStreet', { defaultValue: 'Street address' })}
        value={address.street}
        onChange={(value) => onChange('street', value)}
        error={errors.street}
        autoComplete="address-line1"
        placeholder={t('checkout.placeholderStreet', { defaultValue: '123 Main Street' })}
        required
      />

      <div className="checkout-field-row">
        <FormField
          id="building"
          label={t('checkout.fieldBuilding', { defaultValue: 'Building' })}
          value={address.building}
          onChange={(value) => onChange('building', value)}
          autoComplete="address-line2"
          placeholder={t('checkout.placeholderBuilding', { defaultValue: 'Building 5' })}
        />
        <FormField
          id="apartment"
          label={t('checkout.fieldApartment', { defaultValue: 'Apartment' })}
          value={address.apartment}
          onChange={(value) => onChange('apartment', value)}
          placeholder={t('checkout.placeholderApartment', { defaultValue: 'Apt 12B' })}
        />
      </div>

      <div className="checkout-field-row">
        <FormField
          id="floor"
          label={t('checkout.fieldFloor', { defaultValue: 'Floor' })}
          value={address.floor}
          onChange={(value) => onChange('floor', value)}
          placeholder={t('checkout.placeholderFloor', { defaultValue: '3rd floor' })}
        />
        <FormField
          id="city"
          label={t('checkout.fieldCity', { defaultValue: 'City' })}
          value={address.city}
          onChange={(value) => onChange('city', value)}
          error={errors.city}
          autoComplete="address-level2"
          placeholder={t('checkout.placeholderCity', { defaultValue: 'City' })}
          required
        />
      </div>

      <FormField
        id="landmark"
        label={t('checkout.fieldLandmark', { defaultValue: 'Landmark' })}
        value={address.landmark}
        onChange={(value) => onChange('landmark', value)}
        placeholder={t('checkout.placeholderLandmark', { defaultValue: 'Near the central park' })}
      />

      <FormField
        id="addressPhone"
        label={t('checkout.fieldContactPhone', { defaultValue: 'Contact phone' })}
        type="tel"
        value={address.phone}
        onChange={(value) => onChange('phone', value)}
        error={errors.phone}
        autoComplete="tel"
        inputMode="tel"
        placeholder={t('checkout.placeholderPhone', { defaultValue: '+1 555 012 3456' })}
        required
      />

      {showSave && (
        <label className="checkout-checkbox">
          <input
            type="checkbox"
            checked={saveAddress}
            onChange={(event) => onSaveChange(event.target.checked)}
          />
          <span>{t('checkout.saveAddressForLater', { defaultValue: 'Save this address for future orders' })}</span>
        </label>
      )}
    </div>
  );
}

export default AddressForm;
