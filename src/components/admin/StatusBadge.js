import React from 'react';
import { useTranslation } from 'react-i18next';
import { getOrderStatusMeta, getPaymentStatusMeta } from '../../config/orderStatus';

// Pill badge for order / payment statuses. Colors come from the single source
// of truth in config/orderStatus.js and the labels are translated, so the
// customer tracker and the admin table always agree.
function StatusBadge({ type = 'order', value }) {
  const { t } = useTranslation();
  const meta =
    type === 'payment'
      ? getPaymentStatusMeta(value)
      : getOrderStatusMeta(value);

  if (!meta) return null;

  return (
    <span className={`admin-badge tone-${meta.tone}`}>
      {t(meta.labelKey, { defaultValue: meta.label })}
    </span>
  );
}

export default StatusBadge;