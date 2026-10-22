import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileInvoice } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import { reorder, cancelOrder } from '../../services/orderService';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import SectionTitle from '../../components/account/SectionTitle';
import OrderCard from '../../components/account/OrderCard';
import ConfirmDialog from '../../components/ConfirmDialog';

function OrdersSection() {
  const { t } = useTranslation();
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
          t('account.toastItemsSkipped', { count: unavailable.length }),
          'warning'
        );
      } else {
        showToast(t('account.toastItemsAddedToCart'));
      }
    } catch (err) {
      showToast(t('account.toastReorderFailed'), 'error');
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
        showToast(t('account.toastOrderCancelled'));
        reload();
      } else {
        showToast(result.error || t('account.toastCancelFailed'), 'error');
      }
    } catch (err) {
      showToast(t('account.toastCancelFailedRetry'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="dash-section">
      <SectionTitle
        title={t('account.navOrders')}
        subtitle={t('account.ordersSubtitle')}
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
            <p>{t('account.ordersLoadError')}</p>
            <p className="dash-form-note">{error}</p>
            <button type="button" className="menu-btn dash-btn-sm" onClick={reload}>
              {t('common.actions.retry')}
            </button>
          </div>
        </div>
      )}

      {status === 'success' && orders.length === 0 && (
        <div className="dash-card">
          <div className="dash-empty">
            <FontAwesomeIcon icon={faFileInvoice} className="dash-empty-icon" />
            <p>{t('account.noOrdersYet')}</p>
            <p className="dash-form-note">
              {t('account.pastOrdersHint')}
            </p>
            <Link to="/menu" className="contact-btn dash-btn-sm">
              {t('account.browseMenu')}
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
          title={t('account.cancelOrderTitle')}
          message={t('account.cancelOrderMessage', { id: pendingCancel.id })}
          confirmLabel={t('account.cancelOrder')}
          danger
          onConfirm={() => handleCancel(pendingCancel)}
          onCancel={() => setPendingCancel(null)}
        />
      )}
    </div>
  );
}

export default OrdersSection;
