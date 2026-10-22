import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSackDollar,
  faReceipt,
  faChartLine,
  faTrophy,
  faBagShopping,
} from '@fortawesome/free-solid-svg-icons';
import { useRestaurantOrders } from '../../hooks/useRestaurantOrders';
import { useRestaurantProducts } from '../../hooks/useRestaurantProducts';
import {
  ANALYTICS_RANGES,
  computeAnalytics,
} from '../../services/adminService';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../i18n/format';
import SectionTitle from '../../components/account/SectionTitle';
import SalesOverview from '../../components/admin/SalesOverview';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminErrorState from '../../components/admin/AdminErrorState';

const TONE_CLASSES = ['is-gold', 'is-green', 'is-coral', 'is-blue'];

// The shared range list carries English labels; the admin UI translates them
// by key so every locale shows its own wording for the same window.
const RANGE_LABEL_KEYS = {
  '7d': 'admin.range7Days',
  '30d': 'admin.range30Days',
  '90d': 'admin.range90Days',
};

function AnalyticsSkeleton() {
  return (
    <>
      <div className="admin-stat-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="admin-stat-card">
            <div className="admin-skeleton-chip" style={{ width: 90, height: 28 }} />
            <div className="admin-skeleton-chip" style={{ width: 60, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </>
  );
}

function AdminAnalytics() {
  const { t, i18n } = useTranslation();
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;

  const { status, orders, error, reload } = useRestaurantOrders(restaurantId);
  const { products } = useRestaurantProducts(restaurantId);
  const [range, setRange] = useState('30d');

  const ranges = useMemo(
    () =>
      ANALYTICS_RANGES.map((entry) => ({
        ...entry,
        label: RANGE_LABEL_KEYS[entry.key]
          ? t(RANGE_LABEL_KEYS[entry.key])
          : entry.label,
      })),
    [t]
  );

  const analytics = useMemo(
    () => computeAnalytics({ orders, products, range }),
    [orders, products, range]
  );

  const cards = [
    {
      key: 'revenue',
      label: t('admin.statRevenue'),
      value: formatMoney(analytics.totalRevenue, i18n.language),
      icon: faSackDollar,
    },
    {
      key: 'orders',
      label: t('admin.statOrders'),
      value: analytics.totalOrders,
      icon: faReceipt,
    },
    {
      key: 'aov',
      label: t('admin.statAvgOrder'),
      value: formatMoney(analytics.averageOrderValue, i18n.language),
      icon: faChartLine,
    },
    {
      key: 'delivered',
      label: t('admin.statDelivered'),
      value: analytics.delivered,
      icon: faBagShopping,
    },
  ];

  return (
    <div className="admin-overview">
      <div className="admin-page-head">
        <SectionTitle
          title={t('admin.navAnalytics')}
          subtitle={t('admin.analyticsSubtitle')}
        />
        <div className="admin-tabs" role="tablist" aria-label={t('admin.ariaAnalyticsRange')}>
          {ranges.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={range === entry.key}
              className={`admin-tab ${range === entry.key ? 'active' : ''}`}
              onClick={() => setRange(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' && <AnalyticsSkeleton />}

      {status === 'error' ? (
        <div className="admin-panel">
          <AdminErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        status === 'success' && (
          <>
            <div className="admin-stat-grid">
              {cards.map((card, index) => (
                <div className="admin-stat-card" key={card.key}>
                  <span className={`admin-stat-icon ${TONE_CLASSES[index % TONE_CLASSES.length]}`}>
                    <FontAwesomeIcon icon={card.icon} />
                  </span>
                  <span className="admin-stat-body">
                    <span className="admin-stat-value">{card.value}</span>
                    <span className="admin-stat-label">{card.label}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="admin-analytics-under">
              <span>{t('admin.analyticsCancelled', { count: analytics.cancelled })}</span>
              <span>{t('admin.analyticsInProgress', { count: analytics.activeOrders })}</span>
              <span>{t('admin.analyticsMenuItems', { count: analytics.totalProducts })}</span>
            </div>

            <SalesOverview
              orders={orders}
              status={status}
              error={error}
              onRetry={reload}
              ranges={ranges}
              range={range}
              onRangeChange={setRange}
            />

            <section className="admin-panel">
              <div className="admin-panel-head">
                <h3>
                  <FontAwesomeIcon icon={faTrophy} /> {t('admin.bestSellers')}
                </h3>
                <p className="admin-panel-sub">{t('admin.bestSellersSub')}</p>
              </div>

              {analytics.bestSellers.length === 0 ? (
                <AdminEmptyState
                  icon={faTrophy}
                  title={t('admin.noSalesInPeriod')}
                  message={t('admin.noSalesInPeriodMessage')}
                />
              ) : (
                <div className="admin-table" role="table" aria-label={t('admin.ariaBestSellers')}>
                  <div className="admin-table-head" role="row">
                    <span role="columnheader">#</span>
                    <span role="columnheader">{t('admin.colProduct')}</span>
                    <span role="columnheader">{t('admin.colSold')}</span>
                    <span role="columnheader">{t('admin.colRevenue')}</span>
                  </div>
                  {analytics.bestSellers.map((item, index) => (
                    <div className="admin-table-row" role="row" key={item.productId || item.name}>
                      <span className="admin-rank" role="cell" data-label={t('admin.colRank')}>
                        {index + 1}
                      </span>
                      <span role="cell" data-label={t('admin.colProduct')}>
                        <strong>{item.name}</strong>
                      </span>
                      <span role="cell" data-label={t('admin.colSold')}>
                        {item.qty}
                      </span>
                      <span
                        className="admin-table-price"
                        role="cell"
                        data-label={t('admin.colRevenue')}
                      >
                        {formatMoney(Number(item.revenue), i18n.language)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}

export default AdminAnalytics;
