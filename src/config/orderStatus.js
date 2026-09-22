// Canonical order lifecycle. Status keys, display text, the completion flow per
// fulfillment type, tone used for badges/trackers, and the set of statuses a
// customer may still cancel are all defined here in ONE place so the UI, the
// confirmation page and the tracking page never drift.

export const ORDER_STATUS = {
  PENDING: 'placed',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

export const ORDER_STATUS_FLOW = {
  delivery: [
    ORDER_STATUS.PENDING,
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.PREPARING,
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.DELIVERED,
  ],
  pickup: [
    ORDER_STATUS.PENDING,
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.PREPARING,
    ORDER_STATUS.READY,
    ORDER_STATUS.DELIVERED,
  ],
};

export const ORDER_STATUS_META = {
  [ORDER_STATUS.PENDING]: {
    label: 'Order placed',
    description: 'We received your order and will confirm it shortly.',
    icon: 'receipt',
    tone: 'info',
  },
  [ORDER_STATUS.CONFIRMED]: {
    label: 'Confirmed',
    description: 'Your order has been confirmed.',
    icon: 'check',
    tone: 'info',
  },
  [ORDER_STATUS.PREPARING]: {
    label: 'Preparing',
    description: 'Our kitchen is working on your order.',
    icon: 'fire',
    tone: 'warning',
  },
  [ORDER_STATUS.READY]: {
    label: 'Ready for pickup',
    description: 'Your order is ready to collect.',
    icon: 'bag',
    tone: 'success',
  },
  [ORDER_STATUS.OUT_FOR_DELIVERY]: {
    label: 'Out for delivery',
    description: 'Your order is on the way.',
    icon: 'truck',
    tone: 'warning',
  },
  [ORDER_STATUS.DELIVERED]: {
    label: 'Delivered',
    description: 'Enjoy! Your order has been delivered.',
    icon: 'check',
    tone: 'success',
  },
  [ORDER_STATUS.CANCELLED]: {
    label: 'Cancelled',
    description: 'This order was cancelled.',
    icon: 'xmark',
    tone: 'danger',
  },
};

export const ORDER_STATUS_LABELS = Object.fromEntries(
  Object.entries(ORDER_STATUS_META).map(([key, meta]) => [key, meta.label])
);

// Statuses a customer may still cancel from their history/tracking pages.
export const CANCELLABLE_ORDER_STATUSES = [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED];

const LEGACY_STATUS_ALIASES = {
  placed: ORDER_STATUS.PENDING,
  confirmed: ORDER_STATUS.CONFIRMED,
  preparing: ORDER_STATUS.PREPARING,
  ready: ORDER_STATUS.READY,
  completed: ORDER_STATUS.DELIVERED,
  'out-for-delivery': ORDER_STATUS.OUT_FOR_DELIVERY,
  out_for_delivery: ORDER_STATUS.OUT_FOR_DELIVERY,
  cancelled: ORDER_STATUS.CANCELLED,
  canceled: ORDER_STATUS.CANCELLED,
};

export function normalizeOrderStatus(status) {
  if (LEGACY_STATUS_ALIASES[status]) return LEGACY_STATUS_ALIASES[status];
  if (ORDER_STATUS_META[status]) return status;
  return ORDER_STATUS.PENDING;
}

export function isValidOrderStatus(status) {
  return Boolean(status) && Boolean(
    LEGACY_STATUS_ALIASES[status] || ORDER_STATUS_META[status]
  );
}

export function getOrderStatusMeta(status) {
  return ORDER_STATUS_META[normalizeOrderStatus(status)] || ORDER_STATUS_META[ORDER_STATUS.PENDING];
}

export function getOrderStatusTone(status) {
  return getOrderStatusMeta(status).tone;
}

export function getOrderStatusFlow(fulfillmentType) {
  return ORDER_STATUS_FLOW[fulfillmentType] || ORDER_STATUS_FLOW.delivery;
}

// The next expected status for an order (used by the admin "advance order"
// action). Returns null when the order is already terminal (delivered/cancelled)
// or currently cancelled.
export function getNextOrderStatus(fulfillmentType, currentStatus) {
  const status = normalizeOrderStatus(currentStatus);
  if (status === ORDER_STATUS.CANCELLED) return null;
  const flow = getOrderStatusFlow(fulfillmentType);
  const index = flow.indexOf(status);
  if (index === -1 || index >= flow.length - 1) return null;
  return flow[index + 1];
}

export function isOrderCancellable(order) {
  return CANCELLABLE_ORDER_STATUSES.includes(
    normalizeOrderStatus(order?.orderStatus)
  );
}

// Normalizes an order record for display: maps legacy status keys, resolves
// display metadata, and adds convenient booleans used by every UI consumer.
export function normalizeOrder(order) {
  if (!order) return null;
  const orderStatus = normalizeOrderStatus(order.orderStatus);
  const paymentStatus = normalizePaymentStatus(order.paymentStatus);
  return {
    ...order,
    orderStatus,
    paymentStatus,
    statusMeta: getOrderStatusMeta(orderStatus),
    paymentMeta: getPaymentStatusMeta(paymentStatus),
    isCancelled: orderStatus === ORDER_STATUS.CANCELLED,
    canCancel: CANCELLABLE_ORDER_STATUSES.includes(orderStatus),
  };
}

// ---------------------------------------------------------------------------
// Payment lifecycle (kept separate from order status on purpose).
// ---------------------------------------------------------------------------

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  UNPAID: 'unpaid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

export const PAYMENT_STATUS_META = {
  [PAYMENT_STATUS.PENDING]: { label: 'Pending', tone: 'info' },
  [PAYMENT_STATUS.PAID]: { label: 'Paid', tone: 'success' },
  [PAYMENT_STATUS.UNPAID]: { label: 'Unpaid', tone: 'warning' },
  [PAYMENT_STATUS.FAILED]: { label: 'Failed', tone: 'danger' },
  [PAYMENT_STATUS.REFUNDED]: { label: 'Refunded', tone: 'muted' },
};

export const PAYMENT_STATUS_LABELS = Object.fromEntries(
  Object.entries(PAYMENT_STATUS_META).map(([key, meta]) => [key, meta.label])
);

export function normalizePaymentStatus(status) {
  if (PAYMENT_STATUS_META[status]) return status;
  if (status === 'complete' || status === 'completed') return PAYMENT_STATUS.PAID;
  return PAYMENT_STATUS.PENDING;
}

export function getPaymentStatusMeta(status) {
  return (
    PAYMENT_STATUS_META[normalizePaymentStatus(status)] ||
    PAYMENT_STATUS_META[PAYMENT_STATUS.PENDING]
  );
}