import React from 'react';
import { NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGaugeHigh,
  faUser,
  faShieldHalved,
  faWallet,
  faLocationDot,
  faBoxArchive,
  faHeart,
  faGear,
} from '@fortawesome/free-solid-svg-icons';

export const ACCOUNT_SECTIONS = [
  { to: '/account', end: true, label: 'Overview', icon: faGaugeHigh },
  { to: '/account/profile', label: 'Profile', icon: faUser },
  { to: '/account/security', label: 'Security', icon: faShieldHalved },
  { to: '/account/payments', label: 'Payments', icon: faWallet },
  { to: '/account/addresses', label: 'Addresses', icon: faLocationDot },
  { to: '/account/orders', label: 'Orders', icon: faBoxArchive },
  { to: '/account/favorites', label: 'Favorites', icon: faHeart },
  { to: '/account/settings', label: 'Settings', icon: faGear },
];

function AccountSidebar() {
  return (
    <nav className="dash-sidebar" aria-label="Account navigation">
      <ul className="dash-sidebar-list">
        {ACCOUNT_SECTIONS.map((section) => (
          <li key={section.to}>
            <NavLink
              to={section.to}
              end={Boolean(section.end)}
              className={({ isActive }) =>
                isActive ? 'dash-nav-link active' : 'dash-nav-link'
              }
            >
              <FontAwesomeIcon icon={section.icon} />
              <span>{section.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default AccountSidebar;