import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileInvoice } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import { reorder, cancelOrder } from '../../services/orderService';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import SectionTitle from '../../components/account/SectionTitle';
import OrderCard from '../../components/account/OrderCard';
import ConfirmDialog from '../../components/ConfirmDialog';

function OrdersSection() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { addItem } = useCart();
  const uid = currentUser?.uid;

  const { status, orders, error, reload } = useOrders(uid);
  const [pendingCancel, setPendingCancel] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const handleReorder = async (order) => {
    setBusyId(order.id);
    try {
      const { items, unavailable } = await reorder(order);
      items.forEach((item) => addItem(item));
      if (unavailable.length) {
        showToast(
          `${unavailable.length} item(s) were unavailable and skipped.`,
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
    <div className="dash-section">
      <SectionTitle
        title="Orders"
        subtitle="Track, reorder or cancel your past orders"
      />

      {status === 'loading' && (
        <>
          <div className="order-card order-card--skeleton" />
          <div className="order-card order-card--skeleton" />
        </>
      )}

      {status === 'error' && (
        <div className="dash-card">
          <div className="dash-empty">
            <FontAwesomeIcon icon={faFileInvoice} className="dash-empty-icon" />
            <p>Something went wrong loading your orders.</p>
            <p className="dash-form-note">{error}</p>
            <button type="button" className="menu-btn dash-btn-sm" onClick={reload}>
              Try Again
            </button>
          </div>
        </div>
      )}

      {status === 'success' && orders.length === 0 && (
        <div className="dash-card">
          <div className="dash-empty">
            <FontAwesomeIcon icon={faFileInvoice} className="dash-empty-icon" />
            <p>No orders yet.</p>
            <p className="dash-form-note">
              Your past orders will appear here once you place one.
            </p>
            <Link to="/menu" className="contact-btn dash-btn-sm">
              Browse Menu
            </Link>
          </div>
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

export default OrdersSection;