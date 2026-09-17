import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell,
  faBars,
  faUser,
  faGear,
  faRightFromBracket,
  faChevronDown,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Avatar from '../account/Avatar';

const ADMIN_TITLES = [
  { path: '/admin', title: 'Dashboard' },
  { path: '/admin/orders', title: 'Orders' },
  { path: '/admin/menu', title: 'Menu' },
  { path: '/admin/customers', title: 'Customers' },
  { path: '/admin/coupons', title: 'Coupons' },
  { path: '/admin/reviews', title: 'Reviews' },
  { path: '/admin/analytics', title: 'Analytics' },
  { path: '/admin/settings', title: 'Settings' },
];

function resolveTitle(pathname) {
  const match = ADMIN_TITLES.find(
    (entry) =>
      pathname === entry.path ||
      pathname.startsWith(`${entry.path}/`)
  );
  return match?.title || 'Dashboard';
}

function AdminHeader({ restaurant, restaurantLoading, onOpenSidebar }) {
  const { currentUser, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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
      showToast('Successfully logged out');
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
          aria-label="Open menu"
        >
          <FontAwesomeIcon icon={faBars} />
        </button>
        <div className="admin-header-title">
          <h1>{resolveTitle(location.pathname)}</h1>
          <p>
            {restaurantLoading
              ? 'Loading restaurant…'
              : restaurant
              ? restaurant.name
              : 'Restaurant'}
            <span className="admin-header-sep">·</span> Owner
          </p>
        </div>
      </div>

      <div className="admin-header-right">
        <button
          type="button"
          className="admin-icon-btn"
          aria-label="Notifications"
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
              {currentUser?.displayName || 'Owner'}
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
                <FontAwesomeIcon icon={faUser} /> Profile
              </Link>
              <Link
                to="/admin/settings"
                role="menuitem"
                className="admin-dropdown-item"
                onClick={() => setMenuOpen(false)}
              >
                <FontAwesomeIcon icon={faGear} /> Restaurant Settings
              </Link>
              <div className="admin-dropdown-divider" />
              <button
                type="button"
                role="menuitem"
                className="admin-dropdown-item is-danger"
                onClick={handleLogout}
              >
                <FontAwesomeIcon icon={faRightFromBracket} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default AdminHeader;