import React from 'react';
import { useTranslation } from 'react-i18next';
import FormField from './FormField';

function CustomerInfoStep({ customer, onChange, errors = {} }) {
  const { t } = useTranslation();
  return (
    <section className="checkout-section" aria-labelledby="checkout-details-title">
      <h2 id="checkout-details-title">{t('checkout.customerInfoTitle')}</h2>
      <p className="checkout-section-sub">
        {t('checkout.customerInfoSubtitle')}
      </p>

      <FormField
        id="fullName"
        label={t('checkout.fieldFullName', { defaultValue: 'Full name' })}
        value={customer.fullName}
        onChange={(value) => onChange('fullName', value)}
        error={errors.fullName}
        autoComplete="name"
        placeholder={t('checkout.placeholderFullName', { defaultValue: 'Jane Doe' })}
        required
      />
      <FormField
        id="email"
        label={t('checkout.fieldEmail', { defaultValue: 'Email' })}
        type="email"
        value={customer.email}
        onChange={(value) => onChange('email', value)}
        error={errors.email}
        autoComplete="email"
        placeholder={t('checkout.placeholderEmail', { defaultValue: 'jane@example.com' })}
        required
      />
      <FormField
        id="phone"
        label={t('checkout.fieldPhone', { defaultValue: 'Phone' })}
        type="tel"
        value={customer.phone}
        onChange={(value) => onChange('phone', value)}
        error={errors.phone}
        autoComplete="tel"
        inputMode="tel"
        placeholder={t('checkout.placeholderPhone', { defaultValue: '+1 555 012 3456' })}
        required
      />
    </section>
  );
}

export default CustomerInfoStep;
