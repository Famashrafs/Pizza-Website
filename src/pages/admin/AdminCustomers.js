import React, { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMagnifyingGlass,
  faUsers,
  faEye,
  faCrown,
  faCircleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { useRestaurantCustomers } from '../../hooks/useRestaurantCustomers';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import SectionTitle from '../../components/account/SectionTitle';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminErrorState from '../../components/admin/AdminErrorState';

const PAGE_SIZE = 10;

function initials(customer) {
  const source = customer.name || customer.email || 'Guest';
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function CustomerSkeleton() {
  return (
    <div className="admin-table admin-table--skeleton">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="admin-table-row">
          <div className="admin-skeleton-chip" style={{ width: 36, height: 36 }} />
          <div className="admin-skeleton-chip" style={{ width: 150 }} />
          <div className="admin-skeleton-chip" style={{ width: 60 }} />
          <div className="admin-skeleton-chip" style={{ width: 70 }} />
        </div>
      ))}
    </div>
  );
}

function AdminCustomers() {
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const currency = RESTAURANT_SETTINGS.currency || '$';

  const { status, customers, error, reload } = useRestaurantCustomers(restaurantId);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = customers.filter((customer) => {
      if (!q) return true;
      return [customer.name, customer.email, customer.phone]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });

    const sorted = [...list];
    if (sort === 'spent') sorted.sort((a, b) => b.totalSpent - a.totalSpent);
    else if (sort === 'orders') sorted.sort((a, b) => b.orderCount - a.orderCount);
    else
      sorted.sort((a, b) =>
        String(b.lastOrderAt || '').localeCompare(String(a.lastOrderAt || ''))
      );
    return sorted;
  }, [customers, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const hasCustomers = customers.length > 0;

  return (
    <div className="admin-overview">
      <div className="admin-page-head">
        <SectionTitle
          title="Customers"
          subtitle={
            hasCustomers
              ? `${customers.length} customer${customers.length === 1 ? '' : 's'} from your orders`
              : 'Customers appear here after their first order'
          }
        />
      </div>

      {hasCustomers && (
        <div className="admin-toolbar">
          <label className="admin-search">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input
              type="search"
              placeholder="Search by name, email or phone…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="Sort customers"
          >
            <option value="recent">Most recent</option>
            <option value="spent">Top spenders</option>
            <option value="orders">Most orders</option>
          </select>
        </div>
      )}

      {status === 'loading' && <CustomerSkeleton />}

      {status === 'error' && (
        <div className="admin-panel">
          <AdminErrorState message={error} onRetry={reload} />
        </div>
      )}

      {status === 'success' && !hasCustomers && (
        <div className="admin-panel">
          <AdminEmptyState
            icon={faUsers}
            title="No customers yet"
            message="Once customers place orders, their profiles and history show up here."
          />
        </div>
      )}

      {status === 'success' && hasCustomers && (
        <div className="admin-panel">
          {pageItems.length === 0 ? (
            <AdminEmptyState
              icon={faCircleExclamation}
              title="No customers match"
              message="Try a different search term."
            />
          ) : (
            <div className="admin-table admin-table--customers" role="table" aria-label="Customers">
              <div className="admin-table-head" role="row">
                <span role="columnheader">Customer</span>
                <span role="columnheader">Contact</span>
                <span role="columnheader">Orders</span>
                <span role="columnheader">Spent</span>
                <span role="columnheader">Last order</span>
                <span role="columnheader" className="admin-table-actions-head">
                  Details
                </span>
              </div>

              {pageItems.map((customer) => (
                <div className="admin-table-row" role="row" key={customer.id}>
                  <div className="admin-customer-cell" role="cell" data-label="Customer">
                    <span className="admin-avatar">{initials(customer)}</span>
                    <div className="admin-table-product-meta">
                      <strong>
                        {customer.name}
                        {customer.customerId && (
                          <span className="admin-badge tone-success admin-badge--inline">
                            <FontAwesomeIcon icon={faCrown} /> Registered
                          </span>
                        )}
                      </strong>
                      <span>{customer.isGuest ? 'Guest checkout' : 'Account customer'}</span>
                    </div>
                  </div>
                  <div className="admin-customer-contact" role="cell" data-label="Contact">
                    <span>{customer.email || '—'}</span>
                    <span>{customer.phone || '—'}</span>
                  </div>
                  <span role="cell" data-label="Orders">
                    {customer.orderCount}
                    {customer.cancelledOrders > 0 && (
                      <small className="admin-muted"> · {customer.cancelledOrders} cancelled</small>
                    )}
                  </span>
                  <span className="admin-table-price" role="cell" data-label="Spent">
                    {currency}
                    {Number(customer.totalSpent).toFixed(2)}
                  </span>
                  <span className="admin-table-date" role="cell" data-label="Last order">
                    {formatDate(customer.lastOrderAt)}
                  </span>
                  <span className="admin-table-actions" role="cell" data-label="Details">
                    <Link
                      to={`/admin/customers/${encodeURIComponent(customer.id)}`}
                      className="admin-icon-btn admin-icon-btn--sm"
                      aria-label={`View ${customer.name}`}
                    >
                      <FontAwesomeIcon icon={faEye} />
                    </Link>
                  </span>
                </div>
              ))}
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

export default AdminCustomers;
