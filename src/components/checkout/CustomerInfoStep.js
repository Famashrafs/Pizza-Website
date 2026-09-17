import React from 'react';
import FormField from './FormField';

function CustomerInfoStep({ customer, onChange, errors = {} }) {
  return (
    <section className="checkout-section" aria-labelledby="checkout-details-title">
      <h2 id="checkout-details-title">Customer Information</h2>
      <p className="checkout-section-sub">
        We&apos;ll use these details to confirm and update your order.
      </p>

      <FormField
        id="fullName"
        label="Full name"
        value={customer.fullName}
        onChange={(value) => onChange('fullName', value)}
        error={errors.fullName}
        autoComplete="name"
        placeholder="Jane Doe"
        required
      />
      <FormField
        id="email"
        label="Email"
        type="email"
        value={customer.email}
        onChange={(value) => onChange('email', value)}
        error={errors.email}
        autoComplete="email"
        placeholder="jane@example.com"
        required
      />
      <FormField
        id="phone"
        label="Phone"
        type="tel"
        value={customer.phone}
        onChange={(value) => onChange('phone', value)}
        error={errors.phone}
        autoComplete="tel"
        inputMode="tel"
        placeholder="+1 555 012 3456"
        required
      />
    </section>
  );
}

export default CustomerInfoStep;
