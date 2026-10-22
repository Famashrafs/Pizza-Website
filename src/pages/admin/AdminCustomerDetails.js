import React, { useMemo } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faEnvelope,
  faPhone,
  faReceipt,
  faCrown,
} from '@fortawesome/free-solid-svg-icons';
import { useRestaurantCustomers } from '../../hooks/useRestaurantCustomers';
import { useRestaurantOrders } from '../../hooks/useRestaurantOrders';
import { getCustomerKey } from '../../services/customerService';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatMoney } from '../../i18n/format';
import StatusBadge from '../../components/admin/StatusBadge';
import AdminErrorState from '../../components/admin/AdminErrorState';

function initials(customer, guestLabel) {
  const source = customer?.name || customer?.email || guestLabel;
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function AdminCustomerDetails() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const navigate = useNavigate();

  const { status, customers, error, reload } = useRestaurantCustomers(restaurantId);
  const { orders } = useRestaurantOrders(restaurantId);

  const customer = useMemo(
    () => customers.find((entry) => entry.id === id),
    [customers, id]
  );

  const customerOrders = useMemo(() => {
    if (!id) return [];
    return orders
      .filter((order) => getCustomerKey(order) === id)
      .sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
  }, [orders, id]);

  if (status === 'loading') {
    return (
      <div className="admin-overview">
        <div className="admin-panel">
          <div className="admin-skeleton-chip" style={{ width: 220, height: 28 }} />
          <div className="admin-skeleton-chip" style={{ width: '50%', marginTop: 12 }} />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="admin-overview">
        <div className="admin-panel">
          <AdminErrorState message={error} onRetry={reload} />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="admin-overview">
        <div className="admin-panel">
          <AdminErrorState
            message={t('admin.errorCustomerNotFound')}
            onRetry={() => navigate('/admin/customers')}
          />
        </div>
      </div>
    );
  }

  const stats = [
    { label: t('admin.statOrders'), value: customer.orderCount },
    { label: t('admin.statCompleted'), value: customer.completedOrders },
    { label: t('admin.statCancelled'), value: customer.cancelledOrders },
    {
      label: t('admin.statTotalSpent'),
      value: formatMoney(Number(customer.totalSpent), i18n.language),
    },
  ];

  return (
    <div className="admin-overview">
      <button
        type="button"
        className="admin-back-link"
        onClick={() => navigate('/admin/customers')}
      >
        <FontAwesomeIcon icon={faArrowLeft} /> {t('admin.backToCustomers')}
      </button>

      <section className="admin-panel admin-customer-profile">
        <span className="admin-avatar admin-avatar--lg">
          {initials(customer, t('admin.guest'))}
        </span>
        <div className="admin-customer-profile-body">
          <h2>
            {customer.name}
            {customer.customerId && !customer.isGuest && (
              <span className="admin-badge tone-success admin-badge--inline">
                <FontAwesomeIcon icon={faCrown} /> {t('admin.registered')}
              </span>
            )}
          </h2>
          <div className="admin-customer-profile-contact">
            <span>
              <FontAwesomeIcon icon={faEnvelope} /> {customer.email || t('admin.noEmail')}
            </span>
            <span>
              <FontAwesomeIcon icon={faPhone} /> {customer.phone || t('admin.noPhone')}
            </span>
          </div>
          <p className="admin-muted">
            {t('admin.firstAndLastOrder', {
              first: formatDateTime(customer.firstOrderAt, i18n.language) || '—',
              last: formatDateTime(customer.lastOrderAt, i18n.language) || '—',
            })}
          </p>
        </div>
      </section>

      <div className="admin-stat-grid">
        {stats.map((stat) => (
          <div className="admin-stat-card" key={stat.label}>
            <span className="admin-stat-body">
              <span className="admin-stat-value">{stat.value}</span>
              <span className="admin-stat-label">{stat.label}</span>
            </span>
          </div>
        ))}
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h3>
            <FontAwesomeIcon icon={faReceipt} /> {t('admin.orderHistory')}
          </h3>
        </div>
        {customerOrders.length === 0 ? (
          <p className="admin-muted">{t('admin.noOrdersForCustomer')}</p>
        ) : (
          <div
            className="admin-table admin-table--orders"
            role="table"
            aria-label={t('admin.ariaCustomerOrders')}
          >
            <div className="admin-table-head" role="row">
              <span role="columnheader">{t('admin.colOrder')}</span>
              <span role="columnheader">{t('admin.colItems')}</span>
              <span role="columnheader">{t('admin.colTotal')}</span>
              <span role="columnheader">{t('admin.colStatus')}</span>
              <span role="columnheader">{t('admin.colPlaced')}</span>
              <span role="columnheader" className="admin-table-actions-head">
                {t('admin.view')}
              </span>
            </div>
            {customerOrders.map((order) => (
              <div className="admin-table-row" role="row" key={order.id}>
                <span className="admin-table-id" role="cell" data-label={t('admin.colOrder')}>
                  {order.id}
                </span>
                <span role="cell" data-label={t('admin.colItems')}>
                  {(order.items || []).length}
                </span>
                <span className="admin-table-price" role="cell" data-label={t('admin.colTotal')}>
                  {formatMoney(Number(order.total), i18n.language)}
                </span>
                <span role="cell" data-label={t('admin.colStatus')}>
                  <StatusBadge type="order" value={order.orderStatus} />
                </span>
                <span className="admin-table-date" role="cell" data-label={t('admin.colPlaced')}>
                  {formatDateTime(order.createdAt, i18n.language) || '—'}
                </span>
                <span className="admin-table-actions" role="cell" data-label={t('admin.view')}>
                  <Link
                    to={`/admin/orders/${order.id}`}
                    className="admin-btn admin-btn--ghost admin-btn--xs"
                  >
                    {t('admin.view')}
                  </Link>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminCustomerDetails;
