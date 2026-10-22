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
import { useTranslation } from 'react-i18next';

// The routes and icons are stable identifiers; only the visible labels are
// translated, so the list is built from the active language at render time.
export function getAccountSections(t) {
  return [
    { to: '/account', end: true, label: t('account.navOverview'), icon: faGaugeHigh },
    { to: '/account/profile', label: t('account.navProfile'), icon: faUser },
    { to: '/account/security', label: t('account.navSecurity'), icon: faShieldHalved },
    { to: '/account/payments', label: t('account.navPayments'), icon: faWallet },
    { to: '/account/addresses', label: t('account.navAddresses'), icon: faLocationDot },
    { to: '/account/orders', label: t('account.navOrders'), icon: faBoxArchive },
    { to: '/account/favorites', label: t('account.navFavorites'), icon: faHeart },
    { to: '/account/settings', label: t('account.navSettings'), icon: faGear },
  ];
}

function AccountSidebar() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const sections = getAccountSections(t);

  return (
    <nav className="dash-sidebar" aria-label={t('account.accountNavigation')}>
      <button
        type="button"
        className="dash-sidebar-toggle"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
      >
        <FontAwesomeIcon icon={open ? faXmark : faBars} />
        {open ? t('account.hideSections') : t('account.accountSections')}
      </button>
      <ul className={`dash-sidebar-list ${open ? 'open' : ''}`}>
        {sections.map((section) => (
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
