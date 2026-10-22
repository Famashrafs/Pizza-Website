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
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../hooks/useOrders';
import {
  computeOverview,
  computeProfileCompletion,
  getFirstIncomplete,
} from '../../services/accountService';
import SectionTitle from '../../components/account/SectionTitle';
import { formatMoney, formatDate } from '../../i18n/format';

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
  const { t, i18n } = useTranslation();
  const statusLabel = order.statusMeta?.labelKey
    ? t(order.statusMeta.labelKey)
    : order.statusMeta?.label || '';

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
          {formatDate(order.createdAt || order.placedAt, i18n.language)}
        </span>
      </div>
      <div className="dash-recent-order-side">
        <span className="dash-recent-order-total">
          {formatMoney(order.total || 0, i18n.language)}
        </span>
        <span
          className={`order-status-badge ${
            order.isCancelled ? 'is-cancelled' : `is-${order.statusMeta.tone}`
          }`}
        >
          {statusLabel}
        </span>
      </div>
    </Link>
  );
}

function Overview() {
  const { t, i18n } = useTranslation();
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const { status, orders, error, reload } = useOrders(uid);
  const { account } = useOutletContext();

  // The profile-completion criteria live in the data layer (src/services), so
  // only the display copy is mapped to translation keys here.
  const COMPLETION_COPY = {
    name: {
      label: 'account.completionName',
      hint: 'account.completionNameHint',
    },
    email: {
      label: 'account.completionEmail',
      hint: 'account.completionEmailHint',
    },
    photo: {
      label: 'account.completionPhoto',
      hint: 'account.completionPhotoHint',
    },
    phone: {
      label: 'account.completionPhone',
      hint: 'account.completionPhoneHint',
    },
    address: {
      label: 'account.completionAddress',
      hint: 'account.completionAddressHint',
    },
  };

  const overview = useMemo(() => computeOverview(account, orders), [account, orders]);
  const completion = useMemo(() => computeProfileCompletion(account), [account]);
  const firstIncomplete = useMemo(
    () => getFirstIncomplete(account),
    [account]
  );

  return (
    <div className="dash-section">
      <div className="dash-section-head">
        <SectionTitle
          title={t('account.navOverview')}
          subtitle={t('account.overviewSubtitle')}
        />
        <Link to="/menu" className="dash-text-link">
          {t('account.browseMenuLower')}
        </Link>
      </div>

      <div className="dash-stat-grid">
        <StatCard
          icon={faBoxArchive}
          label={t('account.navOrders')}
          value={overview.ordersCount}
          sub={t('account.activeOrders', { count: overview.activeOrders })}
          to="/account/orders"
        />
        <StatCard
          icon={faWallet}
          label={t('account.totalSpent')}
          value={formatMoney(overview.totalSpent, i18n.language)}
          to="/account/orders"
        />
        <StatCard
          icon={faHeart}
          label={t('account.navFavorites')}
          value={overview.favoritesCount}
          to="/account/favorites"
        />
        <StatCard
          icon={faLocationDot}
          label={t('account.savedAddresses')}
          value={overview.addressesCount}
          to="/account/addresses"
        />
      </div>

      <div className="dash-columns">
        <section className="dash-card dash-recent">
          <div className="dash-card-head">
            <h3>{t('account.recentOrders')}</h3>
            <Link to="/account/orders" className="dash-text-link">
              {t('common.actions.viewAll')}
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
                {t('common.actions.retry')}
              </button>
            </div>
          )}
          {status === 'success' && orders.length === 0 && (
            <div className="dash-empty">
              <p>{t('account.notOrderedYet')}</p>
              <Link to="/menu" className="menu-btn">
                {t('account.browseMenu')}
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
            <h3>{t('account.profileCompletion')}</h3>
            <span className="dash-completion-percent">{completion.percent}%</span>
          </div>
          <div className="dash-completion-bar">
            <span style={{ width: `${completion.percent}%` }} />
          </div>
          <ul className="dash-completion-list">
            {completion.items.map((item) => {
              const copy = COMPLETION_COPY[item.key] || {};
              return (
                <li key={item.key} className={item.complete ? 'done' : ''}>
                  <span className="dash-completion-check">
                    {item.complete ? '✓' : '○'}
                  </span>
                  {item.complete ? (
                    <span>{copy.label ? t(copy.label) : item.label}</span>
                  ) : (
                    <Link to={`/account/${item.section}`}>
                      {copy.hint ? t(copy.hint) : item.hint}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          {firstIncomplete && (
            <Link
              to={`/account/${firstIncomplete.section}`}
              className="contact-btn dash-completion-cta"
            >
              {t('account.completeProfile')}
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

export default Overview;
