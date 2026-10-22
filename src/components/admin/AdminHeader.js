import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import {
  faBell,
  faBars,
  faUser,
  faGear,
  faRightFromBracket,
  faChevronDown,
  faSun,
  faMoon,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';
import Avatar from '../account/Avatar';

function AdminHeader({ restaurant, restaurantLoading, onOpenSidebar }) {
  const { t } = useTranslation();
  const { currentUser, logout } = useAuth();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const isDark = theme === 'dark';

  // The section titles live inside the component so they can be translated.
  const adminTitles = [
    { path: '/admin', titleKey: 'admin.titleDashboard' },
    { path: '/admin/orders', titleKey: 'admin.navOrders' },
    { path: '/admin/menu', titleKey: 'admin.navMenu' },
    { path: '/admin/customers', titleKey: 'admin.navCustomers' },
    { path: '/admin/coupons', titleKey: 'admin.navCoupons' },
    { path: '/admin/reviews', titleKey: 'admin.navReviews' },
    { path: '/admin/analytics', titleKey: 'admin.navAnalytics' },
    { path: '/admin/settings', titleKey: 'admin.navSettings' },
  ];

  const resolveTitle = (pathname) => {
    const match = adminTitles.find(
      (entry) =>
        pathname === entry.path ||
        pathname.startsWith(`${entry.path}/`)
    );
    return t(match?.titleKey || 'admin.titleDashboard');
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    const result = await logout();
    if (result.success) {
      showToast(t('admin.toastLogoutSuccess'));
      navigate('/', { replace: true });
    }
  };

  return (
    <header className="admin-header">
      <div className="admin-header-left">
        <button
          type="button"
          className="admin-burger"
          onClick={onOpenSidebar}
          aria-label={t('admin.ariaOpenMenu')}
        >
          <FontAwesomeIcon icon={faBars} />
        </button>
        <div className="admin-header-title">
          <h1>{resolveTitle(location.pathname)}</h1>
          <p>
            {restaurantLoading
              ? t('admin.loadingRestaurant')
              : restaurant
              ? restaurant.name
              : t('admin.restaurantFallback')}
            <span className="admin-header-sep">·</span> {t('admin.owner')}
          </p>
        </div>
      </div>

      <div className="admin-header-right">
        <button
          type="button"
          className="admin-icon-btn theme-toggle"
          aria-label={
            isDark ? t('nav.aria.switchToLight') : t('nav.aria.switchToDark')
          }
          title={isDark ? t('nav.aria.switchToLight') : t('nav.aria.switchToDark')}
          onClick={toggleTheme}
        >
          <FontAwesomeIcon icon={isDark ? faSun : faMoon} />
        </button>

        <button
          type="button"
          className="admin-icon-btn"
          aria-label={t('admin.ariaNotifications')}
        >
          <FontAwesomeIcon icon={faBell} />
          <span className="admin-notif-dot" aria-hidden="true" />
        </button>

        <div className="admin-user-menu" ref={menuRef}>
          <button
            type="button"
            className="admin-user-button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <Avatar
              name={currentUser?.displayName}
              photoURL={currentUser?.photoURL}
              size="sm"
            />
            <span className="admin-user-name">
              {currentUser?.displayName || t('admin.owner')}
            </span>
            <FontAwesomeIcon icon={faChevronDown} className="admin-user-chevron" />
          </button>

          {menuOpen && (
            <div className="admin-dropdown" role="menu">
              <Link
                to="/account"
                role="menuitem"
                className="admin-dropdown-item"
                onClick={() => setMenuOpen(false)}
              >
                <FontAwesomeIcon icon={faUser} /> {t('admin.profile')}
              </Link>
              <Link
                to="/admin/settings"
                role="menuitem"
                className="admin-dropdown-item"
                onClick={() => setMenuOpen(false)}
              >
                <FontAwesomeIcon icon={faGear} /> {t('admin.restaurantSettings')}
              </Link>
              <div className="admin-dropdown-divider" />
              <button
                type="button"
                role="menuitem"
                className="admin-dropdown-item is-danger"
                onClick={handleLogout}
              >
                <FontAwesomeIcon icon={faRightFromBracket} /> {t('nav.links.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default AdminHeader;