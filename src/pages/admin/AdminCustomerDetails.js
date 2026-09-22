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
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import StatusBadge from '../../components/admin/StatusBadge';
import AdminErrorState from '../../components/admin/AdminErrorState';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function initials(customer) {
  const source = customer?.name || customer?.email || 'Guest';
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function AdminCustomerDetails() {
  const { id } = useParams();
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const currency = RESTAURANT_SETTINGS.currency || '$';
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
            message="We couldn't find that customer."
            onRetry={() => navigate('/admin/customers')}
          />
        </div>
      </div>
    );
  }

  const stats = [
    { label: 'Orders', value: customer.orderCount },
    { label: 'Completed', value: customer.completedOrders },
    { label: 'Cancelled', value: customer.cancelledOrders },
    { label: 'Total spent', value: `${currency}${Number(customer.totalSpent).toFixed(2)}` },
  ];

  return (
    <div className="admin-overview">
      <button
        type="button"
        className="admin-back-link"
        onClick={() => navigate('/admin/customers')}
      >
        <FontAwesomeIcon icon={faArrowLeft} /> Back to customers
      </button>

      <section className="admin-panel admin-customer-profile">
        <span className="admin-avatar admin-avatar--lg">{initials(customer)}</span>
        <div className="admin-customer-profile-body">
          <h2>
            {customer.name}
            {customer.customerId && (
              <span className="admin-badge tone-success admin-badge--inline">
                <FontAwesomeIcon icon={faCrown} /> Registered
              </span>
            )}
          </h2>
          <div className="admin-customer-profile-contact">
            <span>
              <FontAwesomeIcon icon={faEnvelope} /> {customer.email || 'No email'}
            </span>
            <span>
              <FontAwesomeIcon icon={faPhone} /> {customer.phone || 'No phone'}
            </span>
          </div>
          <p className="admin-muted">
            First order {formatDateTime(customer.firstOrderAt)} · Last order{' '}
            {formatDateTime(customer.lastOrderAt)}
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
            <FontAwesomeIcon icon={faReceipt} /> Order history
          </h3>
        </div>
        {customerOrders.length === 0 ? (
          <p className="admin-muted">No orders found for this customer.</p>
        ) : (
          <div className="admin-table admin-table--orders" role="table" aria-label="Customer orders">
            <div className="admin-table-head" role="row">
              <span role="columnheader">Order</span>
              <span role="columnheader">Items</span>
              <span role="columnheader">Total</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Placed</span>
              <span role="columnheader" className="admin-table-actions-head">
                View
              </span>
            </div>
            {customerOrders.map((order) => (
              <div className="admin-table-row" role="row" key={order.id}>
                <span className="admin-table-id" role="cell" data-label="Order">
                  {order.id}
                </span>
                <span role="cell" data-label="Items">
                  {(order.items || []).length}
                </span>
                <span className="admin-table-price" role="cell" data-label="Total">
                  {currency}
                  {Number(order.total).toFixed(2)}
                </span>
                <span role="cell" data-label="Status">
                  <StatusBadge type="order" value={order.orderStatus} />
                </span>
                <span className="admin-table-date" role="cell" data-label="Placed">
                  {formatDateTime(order.createdAt)}
                </span>
                <span className="admin-table-actions" role="cell" data-label="View">
                  <Link
                    to={`/admin/orders/${order.id}`}
                    className="admin-btn admin-btn--ghost admin-btn--xs"
                  >
                    View
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
