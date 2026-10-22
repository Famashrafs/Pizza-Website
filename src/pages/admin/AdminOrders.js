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
import { formatDateTime, formatMoney } from '../../i18n/format';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next';
import SectionTitle from '../../components/account/SectionTitle';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminErrorState from '../../components/admin/AdminErrorState';
import StatusBadge from '../../components/admin/StatusBadge';

const PAGE_SIZE = 10;

const ACTIVE_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.OUT_FOR_DELIVERY,
];

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
  const { t, i18n } = useTranslation();
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const { showToast } = useToast();

  // The tabs live inside the component so their labels can be translated.
  const tabs = [
    { id: 'all', labelKey: 'admin.tabAll' },
    { id: 'active', labelKey: 'admin.tabActive' },
    { id: 'completed', labelKey: 'admin.tabCompleted' },
    { id: 'cancelled', labelKey: 'admin.tabCancelled' },
  ];

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
        const statusLabel = t(result.order.statusMeta.labelKey, {
          defaultValue: result.order.statusMeta.label,
        });
        showToast(t('admin.toastOrderMarked', { id: order.id, status: statusLabel }));
      } else {
        showToast(result.error || t('admin.errorUpdateOrder'), 'error');
      }
    } catch (err) {
      showToast(t('admin.errorUpdateOrder'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const hasOrders = orders.length > 0;

  return (
    <div className="admin-overview">
      <div className="admin-page-head">
        <SectionTitle
          title={t('admin.navOrders')}
          subtitle={
            hasOrders
              ? t('admin.ordersSubtitle', { active: counts.active, total: counts.all })
              : t('admin.ordersSubtitleEmpty')
          }
        />
      </div>

      {hasOrders && (
        <div className="admin-tabs" role="tablist">
          {tabs.map((entry) => (
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
              {t(entry.labelKey)}
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
              placeholder={t('admin.searchOrders')}
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
            title={t('admin.noOrdersYet')}
            message={t('admin.noOrdersYetMessage')}
          />
        </div>
      )}

      {status === 'success' && hasOrders && (
        <div className="admin-panel">
          {pageItems.length === 0 ? (
            <AdminEmptyState
              icon={faCircleExclamation}
              title={t('admin.noOrdersMatch')}
              message={t('admin.tryDifferentTabOrSearch')}
            />
          ) : (
            <div
              className="admin-table admin-table--orders"
              role="table"
              aria-label={t('admin.ariaOrdersTable')}
            >
              <div className="admin-table-head" role="row">
                <span role="columnheader">{t('admin.colOrder')}</span>
                <span role="columnheader">{t('admin.colCustomer')}</span>
                <span role="columnheader">{t('admin.colItems')}</span>
                <span role="columnheader">{t('admin.colTotal')}</span>
                <span role="columnheader">{t('admin.colType')}</span>
                <span role="columnheader">{t('admin.colStatus')}</span>
                <span role="columnheader">{t('admin.colPlaced')}</span>
                <span role="columnheader" className="admin-table-actions-head">
                  {t('admin.colActions')}
                </span>
              </div>

              {pageItems.map((order) => {
                const next = getNextOrderStatus(order.fulfillmentType, order.orderStatus);
                return (
                  <div className="admin-table-row" role="row" key={order.id}>
                    <span className="admin-table-id" role="cell" data-label={t('admin.colOrder')}>
                      {order.id}
                    </span>
                    <span
                      className="admin-table-customer"
                      role="cell"
                      data-label={t('admin.colCustomer')}
                    >
                      {order.customer?.fullName || t('admin.guest')}
                    </span>
                    <span className="admin-table-items" role="cell" data-label={t('admin.colItems')}>
                      {(order.items || []).length}
                    </span>
                    <span className="admin-table-price" role="cell" data-label={t('admin.colTotal')}>
                      {formatMoney(Number(order.total), i18n.language)}
                    </span>
                    <span className="admin-table-type" role="cell" data-label={t('admin.colType')}>
                      {order.fulfillmentType === 'pickup'
                        ? t('admin.pickup')
                        : t('admin.delivery')}
                    </span>
                    <span className="admin-table-status" role="cell" data-label={t('admin.colStatus')}>
                      <StatusBadge type="order" value={order.orderStatus} />
                    </span>
                    <span className="admin-table-date" role="cell" data-label={t('admin.colPlaced')}>
                      {formatDateTime(order.createdAt, i18n.language) || '—'}
                    </span>
                    <span
                      className="admin-table-actions"
                      role="cell"
                      data-label={t('admin.colActions')}
                    >
                      <Link
                        to={`/admin/orders/${order.id}`}
                        className="admin-icon-btn admin-icon-btn--sm"
                        aria-label={t('admin.ariaViewOrder', { id: order.id })}
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
                          <FontAwesomeIcon icon={faForward} /> {t('admin.advance')}
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
                {t('admin.previous')}
              </button>
              <span>
                {t('admin.pageOf', { page: safePage, total: totalPages })}
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                {t('common.actions.next')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminOrders;
