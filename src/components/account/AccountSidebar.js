import React, { useState } from 'react';
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
  faBars,
  faXmark,
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
  const [open, setOpen] = useState(false);

  return (
    <nav className="dash-sidebar" aria-label="Account navigation">
      <button
        type="button"
        className="dash-sidebar-toggle"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
      >
        <FontAwesomeIcon icon={open ? faXmark : faBars} />
        {open ? 'Hide sections' : 'Account sections'}
      </button>
      <ul className={`dash-sidebar-list ${open ? 'open' : ''}`}>
        {ACCOUNT_SECTIONS.map((section) => (
          <li key={section.to}>
            <NavLink
              to={section.to}
              end={Boolean(section.end)}
              className={({ isActive }) =>
                isActive ? 'dash-nav-link active' : 'dash-nav-link'
              }
              onClick={() => setOpen(false)}
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