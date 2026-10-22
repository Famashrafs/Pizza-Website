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
import { formatDate, formatMoney } from '../../i18n/format';
import { useTranslation } from 'react-i18next';
import SectionTitle from '../../components/account/SectionTitle';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminErrorState from '../../components/admin/AdminErrorState';

const PAGE_SIZE = 10;

function initials(customer, guestLabel) {
  const source = customer.name || customer.email || guestLabel;
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
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
  const { t, i18n } = useTranslation();
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const guestLabel = t('admin.guest');

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
          title={t('admin.navCustomers')}
          subtitle={
            hasCustomers
              ? t('admin.customersSubtitle', { count: customers.length })
              : t('admin.customersEmptySubtitle')
          }
        />
      </div>

      {hasCustomers && (
        <div className="admin-toolbar">
          <label className="admin-search">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input
              type="search"
              placeholder={t('admin.searchCustomers')}
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
            aria-label={t('admin.ariaSortCustomers')}
          >
            <option value="recent">{t('admin.sortRecent')}</option>
            <option value="spent">{t('admin.sortSpenders')}</option>
            <option value="orders">{t('admin.sortOrders')}</option>
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
            title={t('admin.noCustomersYet')}
            message={t('admin.noCustomersYetMessage')}
          />
        </div>
      )}

      {status === 'success' && hasCustomers && (
        <div className="admin-panel">
          {pageItems.length === 0 ? (
            <AdminEmptyState
              icon={faCircleExclamation}
              title={t('admin.noCustomersMatch')}
              message={t('admin.tryDifferentSearch')}
            />
          ) : (
            <div
              className="admin-table admin-table--customers"
              role="table"
              aria-label={t('admin.ariaCustomersTable')}
            >
              <div className="admin-table-head" role="row">
                <span role="columnheader">{t('admin.colCustomer')}</span>
                <span role="columnheader">{t('admin.colContact')}</span>
                <span role="columnheader">{t('admin.colOrders')}</span>
                <span role="columnheader">{t('admin.colSpent')}</span>
                <span role="columnheader">{t('admin.colLastOrder')}</span>
                <span role="columnheader" className="admin-table-actions-head">
                  {t('admin.colDetails')}
                </span>
              </div>

              {pageItems.map((customer) => (
                <div className="admin-table-row" role="row" key={customer.id}>
                  <div
                    className="admin-customer-cell"
                    role="cell"
                    data-label={t('admin.colCustomer')}
                  >
                    <span className="admin-avatar">{initials(customer, guestLabel)}</span>
                    <div className="admin-table-product-meta">
                      <strong>
                        {customer.name}
                        {customer.customerId && !customer.isGuest && (
                          <span className="admin-badge tone-success admin-badge--inline">
                            <FontAwesomeIcon icon={faCrown} /> {t('admin.registered')}
                          </span>
                        )}
                      </strong>
                      <span>
                        {customer.isGuest ? t('admin.guestCheckout') : t('admin.accountCustomer')}
                      </span>
                    </div>
                  </div>
                  <div
                    className="admin-customer-contact"
                    role="cell"
                    data-label={t('admin.colContact')}
                  >
                    <span>{customer.email || '—'}</span>
                    <span>{customer.phone || '—'}</span>
                  </div>
                  <span role="cell" data-label={t('admin.colOrders')}>
                    {customer.orderCount}
                    {customer.cancelledOrders > 0 && (
                      <small className="admin-muted">
                        {' '}
                        · {t('admin.cancelledSuffix', { count: customer.cancelledOrders })}
                      </small>
                    )}
                  </span>
                  <span className="admin-table-price" role="cell" data-label={t('admin.colSpent')}>
                    {formatMoney(Number(customer.totalSpent), i18n.language)}
                  </span>
                  <span className="admin-table-date" role="cell" data-label={t('admin.colLastOrder')}>
                    {formatDate(customer.lastOrderAt, i18n.language, { dateStyle: 'medium' }) || '—'}
                  </span>
                  <span className="admin-table-actions" role="cell" data-label={t('admin.colDetails')}>
                    <Link
                      to={`/admin/customers/${encodeURIComponent(customer.id)}`}
                      className="admin-icon-btn admin-icon-btn--sm"
                      aria-label={t('admin.ariaViewCustomer', { name: customer.name })}
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

export default AdminCustomers;
