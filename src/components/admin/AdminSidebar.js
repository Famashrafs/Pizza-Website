import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
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

const NAV_ITEMS = [
  { to: '/admin', end: true, label: 'Overview', icon: faGaugeHigh },
  { to: '/admin/orders', label: 'Orders', icon: faReceipt },
  { to: '/admin/menu', label: 'Menu', icon: faUtensils },
  { to: '/admin/customers', label: 'Customers', icon: faUsers },
  { to: '/admin/coupons', label: 'Coupons', icon: faTicket },
  { to: '/admin/reviews', label: 'Reviews', icon: faStar },
  { to: '/admin/analytics', label: 'Analytics', icon: faChartLine },
  { to: '/admin/settings', label: 'Settings', icon: faGear },
];

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
  const { logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    onClose();
    const result = await logout();
    if (result.success) {
      showToast('Successfully logged out');
      navigate('/', { replace: true });
    }
  };

  return (
    <>
      {open && <div className="admin-sidebar-overlay" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`admin-sidebar ${open ? 'is-open' : ''}`}
        aria-label="Restaurant dashboard navigation"
      >
        <div className="admin-sidebar-top">
          <div className="admin-sidebar-brand">Slice Admin</div>
          <button
            type="button"
            className="admin-sidebar-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <nav className="admin-nav">
          {NAV_ITEMS.map((item) => (
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
              <span>{item.label}</span>
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
                  <span>{restaurant.tagline || 'Restaurant'}</span>
                </div>
              </>
            ) : (
              <div className="admin-restaurant-meta">
                <strong>Restaurant</strong>
                <span>Not configured yet</span>
              </div>
            )}
          </div>

          <div className="admin-owner-tile">
            <Avatar name={owner?.displayName} photoURL={owner?.photoURL} size="sm" />
            <div className="admin-owner-meta">
              <strong>{owner?.displayName || 'Owner'}</strong>
              <span>Restaurant Owner</span>
            </div>
          </div>

          <button type="button" className="admin-logout-btn" onClick={handleLogout}>
            <FontAwesomeIcon icon={faRightFromBracket} /> Log out
          </button>
        </div>
      </aside>
    </>
  );
}

export default AdminSidebar;