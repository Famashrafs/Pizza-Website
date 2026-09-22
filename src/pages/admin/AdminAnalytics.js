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
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import SectionTitle from '../../components/account/SectionTitle';
import SalesOverview from '../../components/admin/SalesOverview';
import AdminEmptyState from '../../components/admin/AdminEmptyState';
import AdminErrorState from '../../components/admin/AdminErrorState';

const TONE_CLASSES = ['is-gold', 'is-green', 'is-coral', 'is-blue'];

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
  const { restaurant } = useOutletContext();
  const restaurantId = restaurant?.id || null;
  const currency = RESTAURANT_SETTINGS.currency || '$';

  const { status, orders, error, reload } = useRestaurantOrders(restaurantId);
  const { products } = useRestaurantProducts(restaurantId);
  const [range, setRange] = useState('30d');

  const analytics = useMemo(
    () => computeAnalytics({ orders, products, range }),
    [orders, products, range]
  );

  const cards = [
    {
      key: 'revenue',
      label: 'Revenue',
      value: `${currency}${analytics.totalRevenue.toFixed(2)}`,
      icon: faSackDollar,
    },
    { key: 'orders', label: 'Orders', value: analytics.totalOrders, icon: faReceipt },
    {
      key: 'aov',
      label: 'Avg. order',
      value: `${currency}${analytics.averageOrderValue.toFixed(2)}`,
      icon: faChartLine,
    },
    { key: 'delivered', label: 'Delivered', value: analytics.delivered, icon: faBagShopping },
  ];

  return (
    <div className="admin-overview">
      <div className="admin-page-head">
        <SectionTitle
          title="Analytics"
          subtitle="Understand how your restaurant is performing."
        />
        <div className="admin-tabs" role="tablist" aria-label="Analytics range">
          {ANALYTICS_RANGES.map((entry) => (
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
              <span>
                <strong>{analytics.cancelled}</strong> cancelled
              </span>
              <span>
                <strong>{analytics.activeOrders}</strong> in progress
              </span>
              <span>
                <strong>{analytics.totalProducts}</strong> menu items
              </span>
            </div>

            <SalesOverview
              orders={orders}
              status={status}
              error={error}
              onRetry={reload}
              ranges={ANALYTICS_RANGES}
              range={range}
              onRangeChange={setRange}
            />

            <section className="admin-panel">
              <div className="admin-panel-head">
                <h3>
                  <FontAwesomeIcon icon={faTrophy} /> Best Sellers
                </h3>
                <p className="admin-panel-sub">Top items by quantity sold</p>
              </div>

              {analytics.bestSellers.length === 0 ? (
                <AdminEmptyState
                  icon={faTrophy}
                  title="No sales in this period"
                  message="Once orders come in, your top-selling items will be ranked here."
                />
              ) : (
                <div className="admin-table" role="table" aria-label="Best sellers">
                  <div className="admin-table-head" role="row">
                    <span role="columnheader">#</span>
                    <span role="columnheader">Product</span>
                    <span role="columnheader">Sold</span>
                    <span role="columnheader">Revenue</span>
                  </div>
                  {analytics.bestSellers.map((item, index) => (
                    <div className="admin-table-row" role="row" key={item.productId || item.name}>
                      <span className="admin-rank" role="cell" data-label="Rank">
                        {index + 1}
                      </span>
                      <span role="cell" data-label="Product">
                        <strong>{item.name}</strong>
                      </span>
                      <span role="cell" data-label="Sold">
                        {item.qty}
                      </span>
                      <span className="admin-table-price" role="cell" data-label="Revenue">
                        {currency}
                        {Number(item.revenue).toFixed(2)}
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
