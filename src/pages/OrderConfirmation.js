import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck,
  faTruckFast,
  faStore,
  faClock,
} from '@fortawesome/free-solid-svg-icons';
import { getEstimatedTime, ORDER_STATUS_LABELS } from '../utils/checkoutLogic';
import { RESTAURANT_SETTINGS } from '../config/restaurant';

function OrderConfirmation() {
  const location = useLocation();
  const order = location.state?.order;

  if (!order) {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">ORDER</h1>
        </div>
        <div className="auth-card">
          <h2>No order found</h2>
          <p className="auth-subtitle">
            We couldn&apos;t find a recent order to confirm.
          </p>
          <Link to="/menu" className="contact-btn empty-cart-btn">
            Browse Menu
          </Link>
        </div>
      </div>
    );
  }

  const isPickup = order.fulfillmentType === 'pickup';
  const estimated =
    order.estimatedTime || getEstimatedTime(order.fulfillmentType);

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">THANK YOU!</h1>
      </div>

      <div className="confirmation-card">
        <div className="confirmation-icon" aria-hidden="true">
          <FontAwesomeIcon icon={faCircleCheck} />
        </div>
        <h2>Order confirmed 🎉</h2>
        <p className="confirmation-sub">
          Thanks {order.customer?.fullName || 'friend'}! We&apos;ve received your
          order and sent a confirmation to {order.customer?.email}.
        </p>

        <div className="confirmation-facts">
          <div className="confirmation-fact">
            <span>Order number</span>
            <strong>{order.id}</strong>
          </div>
          <div className="confirmation-fact">
            <span>Total</span>
            <strong>
              {RESTAURANT_SETTINGS.currency}
              {order.total.toFixed(2)}
            </strong>
          </div>
          <div className="confirmation-fact">
            <span>
              <FontAwesomeIcon icon={faClock} /> Estimated{' '}
              {isPickup ? 'preparation' : 'delivery'}
            </span>
            <strong>{estimated}</strong>
          </div>
          <div className="confirmation-fact">
            <span>
              <FontAwesomeIcon icon={isPickup ? faStore : faTruckFast} /> Method
            </span>
            <strong>{isPickup ? 'Pickup' : 'Delivery'}</strong>
          </div>
        </div>

        {isPickup ? (
          <p className="confirmation-address">
            Pick up from <strong>{RESTAURANT_SETTINGS.pickup.address}</strong>
          </p>
        ) : (
          <p className="confirmation-address">
            Delivering to <strong>{order.addressText}</strong>
          </p>
        )}

        <p className="confirmation-status">
          Status: <strong>{ORDER_STATUS_LABELS[order.orderStatus] || 'Order placed'}</strong>
          {order.paymentStatus === 'pending' && order.paymentMethod === 'cash' && (
            <span className="confirmation-pay-note">
              {' '}
              · Payment due on {isPickup ? 'pickup' : 'delivery'}
            </span>
          )}
        </p>

        <div className="confirmation-actions">
          <Link
            to={`/orders/${order.id}`}
            className="contact-btn confirmation-primary"
          >
            Track Order
          </Link>
          <Link to="/orders" className="menu-btn">
            View Orders
          </Link>
          <Link to="/menu" className="confirmation-link">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

export default OrderConfirmation;
