import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../hooks/useOrders';
import {
  reorder,
  cancelOrder,
} from '../services/orderService';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import OrderCard from '../components/account/OrderCard';

function Orders() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const { status, orders, error, reload } = useOrders(uid);
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [pendingCancel, setPendingCancel] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const handleReorder = async (order) => {
    setBusyId(order.id);
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
      setBusyId(null);
    }
  };

  const handleCancel = async (order) => {
    setPendingCancel(null);
    setBusyId(order.id);
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
      setBusyId(null);
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">ORDER HISTORY</h1>
      </div>

      <div className="cart-container">
        {status === 'loading' && (
          <>
            <div className="order-card order-card--skeleton" />
            <div className="order-card order-card--skeleton" />
          </>
        )}

        {status === 'error' && (
          <div className="auth-card empty-cart">
            <h2>Something went wrong</h2>
            <p className="auth-subtitle">{error}</p>
            <button type="button" className="contact-btn empty-cart-btn" onClick={reload}>
              Try Again
            </button>
          </div>
        )}

        {status === 'success' && orders.length === 0 && (
          <div className="auth-card empty-cart">
            <h2>You haven&apos;t ordered yet.</h2>
            <p className="auth-subtitle">
              Your past orders will appear here once you place one.
            </p>
            <Link to="/menu" className="contact-btn empty-cart-btn">
              Browse Menu
            </Link>
          </div>
        )}

        {status === 'success' &&
          orders.length > 0 &&
          orders.map((order) => (
            <OrderCard
              order={order}
              key={order.id}
              busy={busyId === order.id}
              onReorder={handleReorder}
              onCancel={(o) => setPendingCancel(o)}
            />
          ))}
      </div>

      {pendingCancel && (
        <ConfirmDialog
          title="Cancel this order?"
          message={`Order ${
            pendingCancel.id
          } will be cancelled and its items will not be prepared.`}
          confirmLabel="Cancel Order"
          danger
          onConfirm={() => handleCancel(pendingCancel)}
          onCancel={() => setPendingCancel(null)}
        />
      )}
    </div>
  );
}

export default Orders;