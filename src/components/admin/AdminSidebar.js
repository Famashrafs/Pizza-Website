import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import {
  faGaugeHigh,
  faReceipt,
  faUtensils,
  faUsers,
  faTicket,
  faStar,
  faChartLine,
  faGear,
  faRightFromBracket,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Avatar from '../account/Avatar';

function initials(name) {
  return (name || 'R')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function AdminSidebar({ restaurant, owner, restaurantLoading, open, onClose }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // The navigation labels live inside the component so they can be translated.
  const navItems = [
    { to: '/admin', end: true, labelKey: 'admin.navOverview', icon: faGaugeHigh },
    { to: '/admin/orders', labelKey: 'admin.navOrders', icon: faReceipt },
    { to: '/admin/menu', labelKey: 'admin.navMenu', icon: faUtensils },
    { to: '/admin/customers', labelKey: 'admin.navCustomers', icon: faUsers },
    { to: '/admin/coupons', labelKey: 'admin.navCoupons', icon: faTicket },
    { to: '/admin/reviews', labelKey: 'admin.navReviews', icon: faStar },
    { to: '/admin/analytics', labelKey: 'admin.navAnalytics', icon: faChartLine },
    { to: '/admin/settings', labelKey: 'admin.navSettings', icon: faGear },
  ];

  const handleLogout = async () => {
    onClose();
    const result = await logout();
    if (result.success) {
      showToast(t('admin.toastLogoutSuccess'));
      navigate('/', { replace: true });
    }
  };

  return (
    <>
      {open && <div className="admin-sidebar-overlay" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`admin-sidebar ${open ? 'is-open' : ''}`}
        aria-label={t('admin.ariaSidebarNav')}
      >
        <div className="admin-sidebar-top">
          <div className="admin-sidebar-brand">{t('admin.brand')}</div>
          <button
            type="button"
            className="admin-sidebar-close"
            onClick={onClose}
            aria-label={t('admin.ariaCloseMenu')}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <nav className="admin-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={Boolean(item.end)}
              className={({ isActive }) =>
                isActive ? 'admin-nav-link active' : 'admin-nav-link'
              }
              onClick={onClose}
            >
              <FontAwesomeIcon icon={item.icon} />
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-restaurant-tile">
            {restaurantLoading ? (
              <>
                <div className="admin-sidebar-skel admin-logo-skel" />
                <div className="admin-sidebar-skel" style={{ width: 120, height: 13 }} />
                <div className="admin-sidebar-skel" style={{ width: 90, height: 11 }} />
              </>
            ) : restaurant ? (
              <>
                <span className="admin-logo-badge">
                  {restaurant.logo ? (
                    <img src={restaurant.logo} alt="" />
                  ) : (
                    initials(restaurant.name)
                  )}
                </span>
                <div className="admin-restaurant-meta">
                  <strong>{restaurant.name}</strong>
                  <span>{restaurant.tagline || t('admin.restaurantFallback')}</span>
                </div>
              </>
            ) : (
              <div className="admin-restaurant-meta">
                <strong>{t('admin.restaurantFallback')}</strong>
                <span>{t('admin.notConfiguredYet')}</span>
              </div>
            )}
          </div>

          <div className="admin-owner-tile">
            <Avatar name={owner?.displayName} photoURL={owner?.photoURL} size="sm" />
            <div className="admin-owner-meta">
              <strong>{owner?.displayName || t('admin.owner')}</strong>
              <span>{t('admin.restaurantOwner')}</span>
            </div>
          </div>

          <button type="button" className="admin-logout-btn" onClick={handleLogout}>
            <FontAwesomeIcon icon={faRightFromBracket} /> {t('nav.links.logout')}
          </button>
        </div>
      </aside>
    </>
  );
}

export default AdminSidebar;