import React, { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMagnifyingGlass,
  faReceipt,
  faForward,
  faEye,
  faCircleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { useRestaurantOrders } from '../../hooks/useRestaurantOrders';
import { updateOrderStatus } from '../../services/orderService';
import { ORDER_STATUS, getNextOrderStatus } from '../../config/orderStatus';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import { useToast } from '../../context/ToastContext';
import SectionTitle from '../../components/account/SectionTitle';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminErrorState from '../../components/admin/AdminErrorState';
import StatusBadge from '../../components/admin/StatusBadge';

const PAGE_SIZE = 10;

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const ACTIVE_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.OUT_FOR_DELIVERY,
];

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function OrderListSkeleton() {
  return (
    <div className="admin-table admin-table--skeleton">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="admin-table-row">
          <div className="admin-skeleton-chip" style={{ width: 90 }} />
          <div className="admin-skeleton-chip" style={{ width: 150 }} />
          <div className="admin-skeleton-chip" style={{ width: 60 }} />
          <div className="admin-skeleton-chip" style={{ width: 70 }} />
          <div className="admin-skeleton-chip" style={{ width: 90 }} />
        </div>
      ))}
    </div>
  );
}

function AdminOrders() {
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const currency = RESTAURANT_SETTINGS.currency || '$';
  const { showToast } = useToast();

  const { status, orders, error, reload } = useRestaurantOrders(restaurantId);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);

  const sorted = useMemo(
    () =>
      [...orders].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      ),
    [orders]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((order) => {
      if (tab === 'active' && !ACTIVE_STATUSES.includes(order.orderStatus)) return false;
      if (tab === 'completed' && order.orderStatus !== ORDER_STATUS.DELIVERED) return false;
      if (tab === 'cancelled' && order.orderStatus !== ORDER_STATUS.CANCELLED) return false;
      if (!q) return true;
      const name = order.customer?.fullName || '';
      return (
        order.id.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        (order.customer?.phone || '').includes(q)
      );
    });
  }, [sorted, tab, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const counts = useMemo(
    () => ({
      all: sorted.length,
      active: sorted.filter((order) => ACTIVE_STATUSES.includes(order.orderStatus)).length,
      completed: sorted.filter((order) => order.orderStatus === ORDER_STATUS.DELIVERED).length,
      cancelled: sorted.filter((order) => order.orderStatus === ORDER_STATUS.CANCELLED).length,
    }),
    [sorted]
  );

  const advance = async (order) => {
    const next = getNextOrderStatus(order.fulfillmentType, order.orderStatus);
    if (!next) return;
    setBusyId(order.id);
    try {
      const result = await updateOrderStatus(order.id, next, { restaurantId });
      if (result.success) {
        showToast(`Order ${order.id} marked ${result.order.statusMeta.label.toLowerCase()}.`);
      } else {
        showToast(result.error || 'Could not update the order.', 'error');
      }
    } catch (err) {
      showToast('Could not update the order.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const hasOrders = orders.length > 0;

  return (
    <div className="admin-overview">
      <div className="admin-page-head">
        <SectionTitle
          title="Orders"
          subtitle={
            hasOrders
              ? `${counts.active} active of ${counts.all} total`
              : 'Track and manage incoming orders'
          }
        />
      </div>

      {hasOrders && (
        <div className="admin-tabs" role="tablist">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={`admin-tab ${tab === entry.id ? 'active' : ''}`}
              onClick={() => {
                setTab(entry.id);
                setPage(1);
              }}
            >
              {entry.label}
              <span className="admin-tab-count">{counts[entry.id]}</span>
            </button>
          ))}
        </div>
      )}

      {hasOrders && (
        <div className="admin-toolbar">
          <label className="admin-search">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input
              type="search"
              placeholder="Search by order id, name or phone…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
      )}

      {status === 'loading' && <OrderListSkeleton />}

      {status === 'error' && (
        <div className="admin-panel">
          <AdminErrorState message={error} onRetry={reload} />
        </div>
      )}

      {status === 'success' && !hasOrders && (
        <div className="admin-panel">
          <AdminEmptyState
            icon={faReceipt}
            title="No orders yet"
            message="New orders from customers will appear here automatically."
          />
        </div>
      )}

      {status === 'success' && hasOrders && (
        <div className="admin-panel">
          {pageItems.length === 0 ? (
            <AdminEmptyState
              icon={faCircleExclamation}
              title="No orders match"
              message="Try a different tab or search term."
            />
          ) : (
            <div className="admin-table admin-table--orders" role="table" aria-label="Orders">
              <div className="admin-table-head" role="row">
                <span role="columnheader">Order</span>
                <span role="columnheader">Customer</span>
                <span role="columnheader">Items</span>
                <span role="columnheader">Total</span>
                <span role="columnheader">Type</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Placed</span>
                <span role="columnheader" className="admin-table-actions-head">
                  Actions
                </span>
              </div>

              {pageItems.map((order) => {
                const next = getNextOrderStatus(order.fulfillmentType, order.orderStatus);
                return (
                  <div className="admin-table-row" role="row" key={order.id}>
                    <span className="admin-table-id" role="cell" data-label="Order">
                      {order.id}
                    </span>
                    <span className="admin-table-customer" role="cell" data-label="Customer">
                      {order.customer?.fullName || 'Guest'}
                    </span>
                    <span className="admin-table-items" role="cell" data-label="Items">
                      {(order.items || []).length}
                    </span>
                    <span className="admin-table-price" role="cell" data-label="Total">
                      {currency}
                      {Number(order.total).toFixed(2)}
                    </span>
                    <span className="admin-table-type" role="cell" data-label="Type">
                      {order.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'}
                    </span>
                    <span className="admin-table-status" role="cell" data-label="Status">
                      <StatusBadge type="order" value={order.orderStatus} />
                    </span>
                    <span className="admin-table-date" role="cell" data-label="Placed">
                      {formatDateTime(order.createdAt)}
                    </span>
                    <span className="admin-table-actions" role="cell" data-label="Actions">
                      <Link
                        to={`/admin/orders/${order.id}`}
                        className="admin-icon-btn admin-icon-btn--sm"
                        aria-label={`View order ${order.id}`}
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </Link>
                      {next && (
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--xs"
                          onClick={() => advance(order)}
                          disabled={busyId === order.id}
                        >
                          <FontAwesomeIcon icon={faForward} /> Advance
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="admin-pagination">
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                Previous
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminOrders;
