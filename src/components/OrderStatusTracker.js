import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faReceipt,
  faCircleCheck,
  faFire,
  faBagShopping,
  faTruckFast,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import {
  ORDER_STATUS_META,
  getOrderStatusFlow,
  normalizeOrderStatus,
} from '../config/orderStatus';

const STATUS_ICONS = {
  receipt: faReceipt,
  check: faCircleCheck,
  fire: faFire,
  bag: faBagShopping,
  truck: faTruckFast,
  xmark: faXmark,
};

function OrderStatusTracker({ order }) {
  const fulfillmentType = order?.fulfillmentType || 'delivery';
  const flow = getOrderStatusFlow(fulfillmentType);
  const current = normalizeOrderStatus(order.orderStatus);
  const cancelled = order?.isCancelled || current === 'cancelled';
  const currentIndex = flow.indexOf(current);

  // Legacy orders may carry old, non-canonical status values. Fall back to the
  // first step of the flow when nothing matches.
  const activeIndex = currentIndex >= 0 ? currentIndex : 0;

  return (
    <ol className={`order-tracker ${cancelled ? 'is-cancelled' : ''}`}>
      {flow.map((key, index) => {
        const meta = ORDER_STATUS_META[key] || {};
        const done = !cancelled && index < activeIndex;
        const isCurrent = !cancelled && index === activeIndex;
        const Icon = STATUS_ICONS[meta.icon] || faCircleCheck;

        return (
          <li
            key={key}
            className={[
              'order-tracker-step',
              done ? 'is-done' : '',
              isCurrent ? 'is-current' : '',
              index === 0 ? 'is-first' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="order-tracker-marker" aria-hidden="true">
              <FontAwesomeIcon icon={Icon} />
            </span>
            <div className="order-tracker-content">
              <p className="order-tracker-label">{meta.label}</p>
              <p className="order-tracker-desc">{meta.description}</p>
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="order-tracker-step is-cancelled-step">
          <span className="order-tracker-marker" aria-hidden="true">
            <FontAwesomeIcon icon={faXmark} />
          </span>
          <div className="order-tracker-content">
            <p className="order-tracker-label">Cancelled</p>
            <p className="order-tracker-desc">
              This order was cancelled and is no longer being prepared.
            </p>
          </div>
        </li>
      )}
    </ol>
  );
}

export default OrderStatusTracker;