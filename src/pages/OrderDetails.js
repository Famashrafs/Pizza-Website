import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrder } from '../hooks/useOrder';
import { reorder, cancelOrder } from '../services/orderService';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import OrderStatusTracker from '../components/OrderStatusTracker';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatAddress } from '../utils/checkoutLogic';
import { RESTAURANT_SETTINGS } from '../config/restaurant';

function OrderDetails() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const { status, order, error, reload } = useOrder(id, uid);
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === 'loading') {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">TRACK ORDER</h1>
        </div>
        <div className="order-detail order-detail--skeleton" />
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
          <h2>Order not found</h2>
          <p className="auth-subtitle">
            We couldn&apos;t find that order on your account.
          </p>
          <Link to="/orders" className="contact-btn empty-cart-btn">
            View Orders
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="auth-page">
        <div className="landing-page">
          <h1 className="landing-title">TRACK ORDER</h1>
        </div>
        <div className="auth-card empty-cart">
          <h2>Something went wrong</h2>
          <p className="auth-subtitle">{error}</p>
          <button type="button" className="contact-btn empty-cart-btn" onClick={reload}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const isPickup = order.fulfillmentType === 'pickup';
  const canCancel = order.canCancel && !order.isCancelled;

  const handleReorder = async () => {
    setBusy(true);
    try {
      const { items, unavailable } = await reorder(order);
      items.forEach((item) => addItem(item));
      if (unavailable.length) {
        showToast(
          `${unavailable.length} item(s) could not be reordered and were skipped.`,
          'warning'
        );
      } else {
        showToast('Items added to your cart.');
      }
    } catch (err) {
      showToast('We could not reorder this order. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setConfirmingCancel(false);
    setBusy(true);
    try {
      const result = await cancelOrder(order.id, uid);
      if (result.success) {
        showToast('Your order was cancelled.');
        reload();
      } else {
        showToast(result.error || 'We could not cancel this order.', 'error');
      }
    } catch (err) {
      showToast('We could not cancel this order. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">TRACK ORDER</h1>
      </div>

      <div className="order-detail">
        <div className="order-detail-head">
          <div>
            <h2>{order.id}</h2>
            <p>
              Placed{' '}
              {new Date(order.createdAt || order.placedAt).toLocaleString()}
            </p>
          </div>
          <span
            className={`order-status-badge ${
              order.isCancelled ? 'is-cancelled' : `is-${order.statusMeta.tone}`
            }`}
          >
            {order.statusMeta.label}
          </span>
        </div>

        <OrderStatusTracker order={order} />

        <div className="order-detail-grid">
          <div className="order-detail-panel">
            <h3>{isPickup ? 'Pickup' : 'Delivery'} details</h3>
            {isPickup ? (
              <p>{RESTAURANT_SETTINGS.pickup.address}</p>
            ) : (
              <p>{order.addressText || formatAddress(order.address)}</p>
            )}
            <p className="review-muted">Estimated: {order.estimatedTime || ''}</p>
            {order.customerNotes && (
              <p className="review-muted">Notes: {order.customerNotes}</p>
            )}
            <p className="review-muted">
              Name: {order.customer?.fullName || '-'}
            </p>
            <p className="review-muted">Phone: {order.customer?.phone || '-'}</p>
          </div>

          <div className="order-detail-panel">
            <h3>Payment</h3>
            <p style={{ textTransform: 'capitalize' }}>
              {order.paymentMethod === 'cash'
                ? 'Cash on delivery'
                : order.paymentMethod}
            </p>
            <p className="review-muted" style={{ textTransform: 'capitalize' }}>
              Status:{' '}
              <span className={`order-payment-badge is-${order.paymentMeta.tone}`}>
                {order.paymentMeta.label}
              </span>
            </p>
          </div>
        </div>

        <div className="order-detail-panel">
          <h3>Items</h3>
          {order.items.map((item) => (
            <div className="order-summary-item" key={item.id}>
              <div className="order-summary-item-main">
                <span className="order-summary-qty">{item.qty}×</span>
                <div>
                  <p className="order-summary-name">{item.name}</p>
                  {item.desc && <small>{item.desc}</small>}
                </div>
              </div>
              <span className="order-summary-price">
                {RESTAURANT_SETTINGS.currency}
                {(item.lineTotal ?? item.price * item.qty).toFixed(2)}
              </span>
            </div>
          ))}

          <div className="order-summary-lines">
            <div className="order-summary-line">
              <span>Subtotal</span>
              <span>
                {RESTAURANT_SETTINGS.currency}
                {Number(order.subtotal || 0).toFixed(2)}
              </span>
            </div>
            {Number(order.discount) > 0 && (
              <div className="order-summary-line order-summary-line--discount">
                <span>Discount</span>
                <span>-{RESTAURANT_SETTINGS.currency}{Number(order.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="order-summary-line">
              <span>Delivery fee</span>
              <span>
                {isPickup
                  ? 'Pickup'
                  : Number(order.deliveryFee) > 0
                  ? `${RESTAURANT_SETTINGS.currency}${Number(order.deliveryFee).toFixed(2)}`
                  : 'Free'}
              </span>
            </div>
            <div className="order-summary-line">
              <span>Tax</span>
              <span>
                {RESTAURANT_SETTINGS.currency}
                {Number(order.tax || 0).toFixed(2)}
              </span>
            </div>
            <div className="order-summary-line order-summary-line--total">
              <span>Total</span>
              <span>
                {RESTAURANT_SETTINGS.currency}
                {Number(order.total || 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="order-detail-actions">
          <Link to="/orders" className="menu-btn">
            All Orders
          </Link>
          <button
            type="button"
            className="menu-btn"
            onClick={handleReorder}
            disabled={busy}
          >
            {busy ? 'Working…' : 'Order Again'}
          </button>
          {canCancel && (
            <button
              type="button"
              className="menu-btn is-danger"
              onClick={() => setConfirmingCancel(true)}
              disabled={busy}
            >
              Cancel Order
            </button>
          )}
          <Link to="/menu" className="contact-btn">
            Continue Shopping
          </Link>
        </div>
      </div>

      {confirmingCancel && (
        <ConfirmDialog
          title="Cancel this order?"
          message={`Order ${order.id} will be cancelled and its items will not be prepared.`}
          confirmLabel="Cancel Order"
          danger
          onConfirm={handleCancel}
          onCancel={() => setConfirmingCancel(false)}
        />
      )}
    </div>
  );
}

export default OrderDetails;