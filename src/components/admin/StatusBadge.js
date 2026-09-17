import React from 'react';
import { getOrderStatusMeta, getPaymentStatusMeta } from '../../config/orderStatus';

// Pill badge for order / payment statuses. Colors and labels come from the
// single source of truth in config/orderStatus.js so the customer tracker and
// admin table always agree.
function StatusBadge({ type = 'order', value }) {
  const meta =
    type === 'payment'
      ? getPaymentStatusMeta(value)
      : getOrderStatusMeta(value);

  if (!meta) return null;

  return <span className={`admin-badge tone-${meta.tone}`}>{meta.label}</span>;
}

export default StatusBadge;