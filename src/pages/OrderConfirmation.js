import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck,
  faTruckFast,
  faStore,
  faClock,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext';
import { getEstimatedTime, ORDER_STATUS_LABELS } from '../utils/checkoutLogic';
import { RESTAURANT_SETTINGS } from '../config/restaurant';
import { normalizeOrderStatus } from '../config/orderStatus';
import {
  getOrderForUser,
  getGuestOrder,
  subscribeCustomerOrders,
} from '../services/orderService';
import { getLastOrder } from '../services/storage';
import OrderStatusTracker from '../components/OrderStatusTracker';

// Statuses that still benefit from live updates; once an order is delivered or
// cancelled the confirmation page stops refreshing.
const ACTIVE_STATUSES = new Set([
  'placed',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'ready',
]);

// Guests have no account-backed subscription, so their confirmation page polls
// the token-verified lookup while the order is still active.
const GUEST_REFRESH_MS = 15000;

function OrderConfirmation() {
  const location = useLocation();
  const { currentUser, isGuest } = useAuth();

  const stateOrder = location.state?.order || null;
  const uid = currentUser && !currentUser.isAnonymous ? currentUser.uid : null;

  // Refresh-safe recovery: React Router state disappears on reload, so fall
  // back to the device-local reference written at checkout. For guests that
  // reference also carries the high-entropy token, which the server verifies
  // before any order data is returned.
  const [recovery] = useState(() => {
    const saved = getLastOrder();
    return {
      orderId: stateOrder?.id || saved?.orderId || null,
      token: saved?.token || null,
    };
  });

  const [order, setOrder] = useState(stateOrder);
  const [status, setStatus] = useState(
    stateOrder ? 'ready' : recovery.orderId ? 'loading' : 'notfound'
  );
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!recovery.orderId) {
      setStatus('notfound');
      return undefined;
    }

    let active = true;
    let timer = null;
    let unsubscribe = null;

    const load = async () => {
      try {
        let fetched = null;
        if (uid) {
          fetched = await getOrderForUser(recovery.orderId, uid);
        } else if (recovery.token) {
          fetched = await getGuestOrder(recovery.orderId, recovery.token);
        }
        if (!active) return;
        if (fetched) {
          setOrder(fetched);
          setStatus('ready');
          if (!ACTIVE_STATUSES.has(normalizeOrderStatus(fetched.orderStatus)) && timer) {
            clearInterval(timer);
            timer = null;
          }
        } else if (!stateOrder) {
          // No order found by the authoritative lookup — never show a fake
          // success, and never claim the order exists.
          setStatus('notfound');
        }
      } catch (err) {
        if (!active) return;
        if (!stateOrder) setStatus('error');
      }
    };

    load();

    if (uid) {
      // Signed-in customers get a live subscription: the restaurant advancing
      // the status updates this page without a refresh.
      unsubscribe = subscribeCustomerOrders(load, { customerId: uid });
    } else if (recovery.token) {
      timer = setInterval(load, GUEST_REFRESH_MS);
    }

    return () => {
      active = false;
      if (timer) clearInterval(timer);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [uid, recovery.orderId, recovery.token, stateOrder, reloadKey]);

  if (status === 'loading') {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">ORDER</h1>
        </div>
        <div className="auth-card">
          <p>Loading your order…</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">ORDER</h1>
        </div>
        <div className="auth-card empty-cart">
          <h2>Something went wrong</h2>
          <p className="auth-subtitle">
            We couldn&apos;t load your order details. Please try again.
          </p>
          <button
            type="button"
            className="contact-btn empty-cart-btn"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (status === 'notfound' || !order) {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">ORDER</h1>
        </div>
        <div className="auth-card">
          <h2>No order found</h2>
          <p className="auth-subtitle">
            We couldn&apos;t find a recent order to confirm. If you just placed
            one, you can find it in your account&apos;s order history — or
            contact us and we&apos;ll help right away.
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
          order. You can follow its progress below
          {isGuest ? ' and on this page any time you return to it.' : '.'}
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
              {Number(order.total || 0).toFixed(2)}
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
          order.addressText && (
            <p className="confirmation-address">
              Delivering to <strong>{order.addressText}</strong>
            </p>
          )
        )}

        <p className="confirmation-status">
          Status:{' '}
          <strong>{ORDER_STATUS_LABELS[order.orderStatus] || 'Order placed'}</strong>
          {order.paymentStatus === 'pending' && order.paymentMethod === 'cash' && (
            <span className="confirmation-pay-note">
              {' '}
              · Payment due on {isPickup ? 'pickup' : 'delivery'}
            </span>
          )}
        </p>

        <div className="confirmation-tracker">
          <h3>Order progress</h3>
          <OrderStatusTracker order={order} />
        </div>

        <div className="confirmation-actions">
          {isGuest ? (
            <Link to="/menu" className="contact-btn confirmation-primary">
              Continue Shopping
            </Link>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default OrderConfirmation;
