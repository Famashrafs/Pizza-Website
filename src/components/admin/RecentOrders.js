import React from 'react';
import { Link } from 'react-router-dom';
import {
  faFileInvoice,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
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

function formatShortDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function itemSummary(items) {
  if (!items?.length) return '—';
  const first = items.slice(0, 2).map((i) => `${i.name} ×${i.qty}`).join(', ');
  const extra = items.length > 2 ? ` +${items.length - 2} more` : '';
  return first + extra;
}

function RecentOrders({ orders = [], status, error, onRetry }) {
  const currency = RESTAURANT_SETTINGS.currency || '$';

  return (
    <section className="admin-panel admin-recent-orders">
      <div className="admin-panel-head">
        <h3>
          <FontAwesomeIcon icon={faFileInvoice} /> Recent Orders
        </h3>
        {status === 'success' && orders.length > 0 && (
          <Link to="/admin/orders" className="admin-text-link">
            View all <FontAwesomeIcon icon={faArrowRight} />
          </Link>
        )}
      </div>

      <div className="admin-panel-body">
        {status === 'loading' && <OrderSkeletonRows />}

        {status === 'error' && (
          <AdminErrorState
            message={error || 'Unable to load orders.'}
            onRetry={onRetry}
          />
        )}

        {status === 'success' && orders.length === 0 && (
          <AdminEmptyState
            icon={faFileInvoice}
            title="No orders yet"
            message="Your recent orders will appear here as soon as customers start placing them."
            actionLabel="View Orders"
            actionTo="/admin/orders"
          />
        )}

        {status === 'success' && orders.length > 0 && (
          <div className="admin-order-list" role="table" aria-label="Recent orders">
            <div className="admin-order-header" role="row">
              <span role="columnheader">Order</span>
              <span role="columnheader">Customer</span>
              <span role="columnheader">Items</span>
              <span role="columnheader">Total</span>
              <span role="columnheader">Payment</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Date</span>
            </div>
            {orders.map((order) => (
              <div key={order.id} className="admin-order-row" role="row">
                <span className="admin-order-id" role="cell">{order.id}</span>
                <span className="admin-order-customer" role="cell">
                  {order.customer?.fullName || order.customer?.email || 'Guest'}
                </span>
                <span className="admin-order-items" role="cell">
                  {itemSummary(order.items)}
                </span>
                <span className="admin-order-total" role="cell">
                  {currency}{Number(order.total || 0).toFixed(2)}
                </span>
                <span className="admin-order-payment" role="cell">
                  <StatusBadge type="payment" value={order.paymentStatus} />
                </span>
                <span className="admin-order-status" role="cell">
                  <StatusBadge type="order" value={order.orderStatus} />
                </span>
                <span className="admin-order-date" role="cell">
                  {formatShortDate(order.createdAt)}
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