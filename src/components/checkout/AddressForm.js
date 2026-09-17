import React from 'react';
import FormField from './FormField';

function AddressForm({ address, onChange, errors = {}, showSave = false, saveAddress = false, onSaveChange }) {
  return (
    <div className="checkout-address">
      <FormField
        id="street"
        label="Street address"
        value={address.street}
        onChange={(value) => onChange('street', value)}
        error={errors.street}
        autoComplete="address-line1"
        placeholder="123 Main Street"
        required
      />

      <div className="checkout-field-row">
        <FormField
          id="building"
          label="Building"
          value={address.building}
          onChange={(value) => onChange('building', value)}
          autoComplete="address-line2"
          placeholder="Building 5"
        />
        <FormField
          id="apartment"
          label="Apartment"
          value={address.apartment}
          onChange={(value) => onChange('apartment', value)}
          placeholder="Apt 12B"
        />
      </div>

      <div className="checkout-field-row">
        <FormField
          id="floor"
          label="Floor"
          value={address.floor}
          onChange={(value) => onChange('floor', value)}
          placeholder="3rd floor"
        />
        <FormField
          id="city"
          label="City"
          value={address.city}
          onChange={(value) => onChange('city', value)}
          error={errors.city}
          autoComplete="address-level2"
          placeholder="City"
          required
        />
      </div>

      <FormField
        id="landmark"
        label="Landmark"
        value={address.landmark}
        onChange={(value) => onChange('landmark', value)}
        placeholder="Near the central park"
      />

      <FormField
        id="addressPhone"
        label="Contact phone"
        type="tel"
        value={address.phone}
        onChange={(value) => onChange('phone', value)}
        error={errors.phone}
        autoComplete="tel"
        inputMode="tel"
        placeholder="+1 555 012 3456"
        required
      />

      {showSave && (
        <label className="checkout-checkbox">
          <input
            type="checkbox"
            checked={saveAddress}
            onChange={(event) => onSaveChange(event.target.checked)}
          />
          <span>Save this address for future orders</span>
        </label>
      )}
    </div>
  );
}

export default AddressForm;
