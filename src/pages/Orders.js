import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          t('orders.toastItemsSkipped', { count: unavailable.length }),
          'warning'
        );
      } else {
        showToast(t('orders.toastItemsAdded'));
      }
    } catch (err) {
      showToast(t('orders.toastReorderFailed'), 'error');
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
        showToast(t('orders.toastCancelled'));
        reload();
      } else {
        showToast(result.error || t('orders.toastCancelFailed'), 'error');
      }
    } catch (err) {
      showToast(t('orders.toastCancelFailedRetry'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">{t('orders.historyTitle')}</h1>
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
            <h2>{t('orders.errorTitle')}</h2>
            <p className="auth-subtitle">{error}</p>
            <button type="button" className="contact-btn empty-cart-btn" onClick={reload}>
              {t('common.actions.retry')}
            </button>
          </div>
        )}

        {status === 'success' && orders.length === 0 && (
          <div className="auth-card empty-cart">
            <h2>{t('orders.emptyTitle')}</h2>
            <p className="auth-subtitle">
              {t('orders.emptyText')}
            </p>
            <Link to="/menu" className="contact-btn empty-cart-btn">
              {t('orders.browseMenu')}
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
          title={t('orders.cancelDialogTitle')}
          message={t('orders.cancelDialogMessage', { id: pendingCancel.id })}
          confirmLabel={t('orders.cancelOrder')}
          danger
          onConfirm={() => handleCancel(pendingCancel)}
          onCancel={() => setPendingCancel(null)}
        />
      )}
    </div>
  );
}

export default Orders;