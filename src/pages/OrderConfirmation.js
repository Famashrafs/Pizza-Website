import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck,
  faTruckFast,
  faStore,
  faClock,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext';
import { getEstimatedTime } from '../utils/checkoutLogic';
import { RESTAURANT_SETTINGS } from '../config/restaurant';
import { getOrderStatusMeta, normalizeOrderStatus } from '../config/orderStatus';
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
  const { t } = useTranslation();
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
          <h1 className="landing-title">{t('checkout.orderPageTitle')}</h1>
        </div>
        <div className="auth-card">
          <p>{t('checkout.loadingOrder')}</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">{t('checkout.orderPageTitle')}</h1>
        </div>
        <div className="auth-card empty-cart">
          <h2>{t('checkout.loadErrorTitle')}</h2>
          <p className="auth-subtitle">
            {t('checkout.loadErrorText')}
          </p>
          <button
            type="button"
            className="contact-btn empty-cart-btn"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t('common.actions.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (status === 'notfound' || !order) {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">{t('checkout.orderPageTitle')}</h1>
        </div>
        <div className="auth-card">
          <h2>{t('checkout.notFoundTitle')}</h2>
          <p className="auth-subtitle">
            {t('checkout.notFoundText')}
          </p>
          <Link to="/menu" className="contact-btn empty-cart-btn">
            {t('checkout.browseMenu')}
          </Link>
        </div>
      </div>
    );
  }

  const isPickup = order.fulfillmentType === 'pickup';
  const estimated =
    order.estimatedTime || getEstimatedTime(order.fulfillmentType);
  const statusMeta = getOrderStatusMeta(order.orderStatus);
  const statusLabel = statusMeta?.labelKey ? t(statusMeta.labelKey) : (statusMeta?.label || 'Order placed');
  const customerName = order.customer?.fullName || t('checkout.defaultCustomerName');

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">{t('checkout.thankYouTitle')}</h1>
      </div>

      <div className="confirmation-card">
        <div className="confirmation-icon" aria-hidden="true">
          <FontAwesomeIcon icon={faCircleCheck} />
        </div>
        <h2>{t('checkout.orderConfirmedTitle')}</h2>
        <p className="confirmation-sub">
          {isGuest
            ? t('checkout.confirmationSubGuest', { name: customerName })
            : t('checkout.confirmationSubSignedIn', { name: customerName })}
        </p>

        <div className="confirmation-facts">
          <div className="confirmation-fact">
            <span>{t('checkout.orderNumber')}</span>
            <strong>{order.id}</strong>
          </div>
          <div className="confirmation-fact">
            <span>{t('checkout.total')}</span>
            <strong>
              {RESTAURANT_SETTINGS.currency}
              {Number(order.total || 0).toFixed(2)}
            </strong>
          </div>
          <div className="confirmation-fact">
            <span>
              <FontAwesomeIcon icon={faClock} />{' '}
              {isPickup ? t('checkout.estimatedPreparation') : t('checkout.estimatedDelivery')}
            </span>
            <strong>{estimated}</strong>
          </div>
          <div className="confirmation-fact">
            <span>
              <FontAwesomeIcon icon={isPickup ? faStore : faTruckFast} /> {t('checkout.method')}
            </span>
            <strong>{isPickup ? t('checkout.fulfillmentPickup') : t('checkout.fulfillmentDelivery')}</strong>
          </div>
        </div>

        {isPickup ? (
          <p className="confirmation-address">
            {t('checkout.pickUpFrom', { address: RESTAURANT_SETTINGS.pickup.address })}
          </p>
        ) : (
          order.addressText && (
            <p className="confirmation-address">
              {t('checkout.deliveringTo', { address: order.addressText })}
            </p>
          )
        )}

        <p className="confirmation-status">
          {t('checkout.statusLabel')}{' '}
          <strong>{statusLabel}</strong>
          {order.paymentStatus === 'pending' && order.paymentMethod === 'cash' && (
            <span className="confirmation-pay-note">
              {' '}
              · {isPickup ? t('checkout.paymentDueOnPickup') : t('checkout.paymentDueOnDelivery')}
            </span>
          )}
        </p>

        <div className="confirmation-tracker">
          <h3>{t('checkout.orderProgress')}</h3>
          <OrderStatusTracker order={order} />
        </div>

        <div className="confirmation-actions">
          {isGuest ? (
            <Link to="/menu" className="contact-btn confirmation-primary">
              {t('checkout.continueShopping')}
            </Link>
          ) : (
            <>
              <Link
                to={`/orders/${order.id}`}
                className="contact-btn confirmation-primary"
              >
                {t('checkout.trackOrder')}
              </Link>
              <Link to="/orders" className="menu-btn">
                {t('checkout.viewOrders')}
              </Link>
              <Link to="/menu" className="confirmation-link">
                {t('checkout.continueShopping')}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default OrderConfirmation;
