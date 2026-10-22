import React from 'react';
import { Link } from 'react-router-dom';
import {
  faFileInvoice,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import { formatDate, formatMoney } from '../../i18n/format';
import StatusBadge from './StatusBadge';
import AdminEmptyState from './AdminEmptyState';
import AdminErrorState from './AdminErrorState';

function OrderSkeletonRows() {
  return (
    <div className="admin-orders-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="admin-order-row admin-order-skeleton">
          <div className="admin-skeleton-chip" />
          <div className="admin-skeleton-chip" style={{ width: 120 }} />
          <div className="admin-skeleton-chip" style={{ width: 100 }} />
          <div className="admin-skeleton-chip" />
          <div className="admin-skeleton-chip" />
          <div className="admin-skeleton-chip" />
          <div className="admin-skeleton-chip" />
        </div>
      ))}
    </div>
  );
}

function itemSummary(items, t) {
  if (!items?.length) return '—';
  const first = items.slice(0, 2).map((i) => `${i.name} ×${i.qty}`).join(', ');
  const extra =
    items.length > 2 ? ` ${t('admin.moreItems', { count: items.length - 2 })}` : '';
  return first + extra;
}

function RecentOrders({ orders = [], status, error, onRetry }) {
  const { t, i18n } = useTranslation();

  return (
    <section className="admin-panel admin-recent-orders">
      <div className="admin-panel-head">
        <h3>
          <FontAwesomeIcon icon={faFileInvoice} /> {t('admin.recentOrders')}
        </h3>
        {status === 'success' && orders.length > 0 && (
          <Link to="/admin/orders" className="admin-text-link">
            {t('common.actions.viewAll')} <FontAwesomeIcon icon={faArrowRight} />
          </Link>
        )}
      </div>

      <div className="admin-panel-body">
        {status === 'loading' && <OrderSkeletonRows />}

        {status === 'error' && (
          <AdminErrorState
            message={error || t('admin.errorLoadOrders')}
            onRetry={onRetry}
          />
        )}

        {status === 'success' && orders.length === 0 && (
          <AdminEmptyState
            icon={faFileInvoice}
            title={t('admin.noOrdersYet')}
            message={t('admin.noOrdersYetMessage')}
            actionLabel={t('admin.viewOrders')}
            actionTo="/admin/orders"
          />
        )}

        {status === 'success' && orders.length > 0 && (
          <div
            className="admin-order-list"
            role="table"
            aria-label={t('admin.ariaRecentOrders')}
          >
            <div className="admin-order-header" role="row">
              <span role="columnheader">{t('admin.colOrder')}</span>
              <span role="columnheader">{t('admin.colCustomer')}</span>
              <span role="columnheader">{t('admin.colItems')}</span>
              <span role="columnheader">{t('admin.colTotal')}</span>
              <span role="columnheader">{t('admin.colPayment')}</span>
              <span role="columnheader">{t('admin.colStatus')}</span>
              <span role="columnheader">{t('admin.colDate')}</span>
            </div>
            {orders.map((order) => (
              <div key={order.id} className="admin-order-row" role="row">
                <span className="admin-order-id" role="cell">{order.id}</span>
                <span className="admin-order-customer" role="cell">
                  {order.customer?.fullName || order.customer?.email || t('admin.guest')}
                </span>
                <span className="admin-order-items" role="cell">
                  {itemSummary(order.items, t)}
                </span>
                <span className="admin-order-total" role="cell">
                  {formatMoney(Number(order.total || 0), i18n.language)}
                </span>
                <span className="admin-order-payment" role="cell">
                  <StatusBadge type="payment" value={order.paymentStatus} />
                </span>
                <span className="admin-order-status" role="cell">
                  <StatusBadge type="order" value={order.orderStatus} />
                </span>
                <span className="admin-order-date" role="cell">
                  {formatDate(order.createdAt, i18n.language, { dateStyle: 'short' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default RecentOrders;