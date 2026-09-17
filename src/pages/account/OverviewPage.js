import React, { useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBoxArchive,
  faWallet,
  faHeart,
  faLocationDot,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import {
  computeOverview,
  computeProfileCompletion,
  getFirstIncomplete,
} from '../../services/accountService';
import SectionTitle from '../../components/account/SectionTitle';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';

function StatCard({ icon, label, value, to, sub }) {
  return (
    <Link to={to} className="dash-stat-card">
      <span className="dash-stat-icon">
        <FontAwesomeIcon icon={icon} />
      </span>
      <div className="dash-stat-body">
        <span className="dash-stat-value">{value}</span>
        <span className="dash-stat-label">{label}</span>
        {sub && <span className="dash-stat-sub">{sub}</span>}
      </div>
      <span className="dash-stat-arrow">
        <FontAwesomeIcon icon={faArrowRight} />
      </span>
    </Link>
  );
}

function RecentOrder({ order }) {
  return (
    <Link to={`/orders/${order.id}`} className="dash-recent-order">
      <div className="dash-recent-order-main">
        <span className="dash-recent-order-id">{order.id}</span>
        <span className="dash-recent-order-items">
          {order.items
            .slice(0, 2)
            .map((item) => `${item.name} ×${item.qty}`)
            .join(', ')}
          {order.items.length > 2 && ` +${order.items.length - 2} more`}
        </span>
        <span className="dash-recent-order-date">
          {new Date(order.createdAt || order.placedAt).toLocaleDateString()}
        </span>
      </div>
      <div className="dash-recent-order-side">
        <span className="dash-recent-order-total">
          {RESTAURANT_SETTINGS.currency}
          {Number(order.total || 0).toFixed(2)}
        </span>
        <span
          className={`order-status-badge ${
            order.isCancelled ? 'is-cancelled' : `is-${order.statusMeta.tone}`
          }`}
        >
          {order.statusMeta.label}
        </span>
      </div>
    </Link>
  );
}

function Overview() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const { status, orders, error, reload } = useOrders(uid);
  const { account } = useOutletContext();

  const overview = useMemo(() => computeOverview(account, orders), [account, orders]);
  const completion = useMemo(() => computeProfileCompletion(account), [account]);
  const firstIncomplete = useMemo(
    () => getFirstIncomplete(account),
    [account]
  );

  return (
    <div className="dash-section">
      <div className="dash-section-head">
        <SectionTitle title="Overview" subtitle="Your account at a glance" />
        <Link to="/menu" className="dash-text-link">
          Browse menu
        </Link>
      </div>

      <div className="dash-stat-grid">
        <StatCard
          icon={faBoxArchive}
          label="Orders"
          value={overview.ordersCount}
          sub={`${overview.activeOrders} active`}
          to="/account/orders"
        />
        <StatCard
          icon={faWallet}
          label="Total Spent"
          value={`${RESTAURANT_SETTINGS.currency}${overview.totalSpent.toFixed(2)}`}
          to="/account/orders"
        />
        <StatCard
          icon={faHeart}
          label="Favorites"
          value={overview.favoritesCount}
          to="/account/favorites"
        />
        <StatCard
          icon={faLocationDot}
          label="Saved Addresses"
          value={overview.addressesCount}
          to="/account/addresses"
        />
      </div>

      <div className="dash-columns">
        <section className="dash-card dash-recent">
          <div className="dash-card-head">
            <h3>Recent Orders</h3>
            <Link to="/account/orders" className="dash-text-link">
              View all
            </Link>
          </div>
          {status === 'loading' && (
            <div className="dash-skeleton-block">
              <div className="dash-skeleton-line" />
              <div className="dash-skeleton-line" />
              <div className="dash-skeleton-line" />
            </div>
          )}
          {status === 'error' && (
            <div className="dash-empty">
              <p>{error}</p>
              <button type="button" className="menu-btn" onClick={reload}>
                Try Again
              </button>
            </div>
          )}
          {status === 'success' && orders.length === 0 && (
            <div className="dash-empty">
              <p>You haven&apos;t ordered yet.</p>
              <Link to="/menu" className="menu-btn">
                Browse Menu
              </Link>
            </div>
          )}
          {status === 'success' &&
            overview.recentOrders.map((order) => (
              <RecentOrder key={order.id} order={order} />
            ))}
        </section>

        <section className="dash-card dash-completion">
          <div className="dash-card-head">
            <h3>Profile Completion</h3>
            <span className="dash-completion-percent">{completion.percent}%</span>
          </div>
          <div className="dash-completion-bar">
            <span style={{ width: `${completion.percent}%` }} />
          </div>
          <ul className="dash-completion-list">
            {completion.items.map((item) => (
              <li key={item.key} className={item.complete ? 'done' : ''}>
                <span className="dash-completion-check">
                  {item.complete ? '✓' : '○'}
                </span>
                {item.complete ? (
                  <span>{item.label}</span>
                ) : (
                  <Link to={`/account/${item.section}`}>{item.hint}</Link>
                )}
              </li>
            ))}
          </ul>
          {firstIncomplete && (
            <Link
              to={`/account/${firstIncomplete.section}`}
              className="contact-btn dash-completion-cta"
            >
              Complete Profile
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

export default Overview;