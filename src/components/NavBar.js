import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCartShopping,
  faMagnifyingGlass,
  faUser,
  faBoxArchive,
  faHeart,
  faGaugeHigh,
  faRightFromBracket,
  faChevronDown,
  faBars,
  faXmark,
  faSun,
  faMoon,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import Avatar from './account/Avatar';
import LanguageSelector from './LanguageSelector';

const NAV_LINKS = [
  { to: '/', key: 'home', end: true },
  { to: '/menu', key: 'menu' },
  { to: '/offers', key: 'offers' },
  { to: '/about', key: 'about' },
  { to: '/contact', key: 'contact' },
];

function NavBar({ isScrolled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { currentUser, isAdmin, isGuest, logout } = useAuth();
  const { count, openDrawer } = useCart();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const isDark = theme === 'dark';

  const closeAll = () => {
    setIsOpen(false);
    setMenuOpen(false);
  };

  // Dismiss the account dropdown on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      closeAll();
      showToast(t('nav.messages.loggedOut'));
      navigate('/');
    }
  };

  const displayName =
    currentUser?.displayName ||
    currentUser?.email?.split('@')[0] ||
    t('nav.links.myAccount');

  return (
    <nav
      className={`site-nav ${isScrolled ? 'is-scrolled' : ''}`}
      aria-label={t('nav.aria.mainNavigation')}
    >
      <div className="container">
        <div className="site-nav-inner">
          <NavLink to="/" className="site-logo" aria-label={t('nav.aria.pizzaHome')}>
            <span className="site-logo-mark">P</span>
            <span>
              Pi<em>zz</em>a
            </span>
          </NavLink>

          <ul className={`site-nav-links ${isOpen ? 'open' : ''}`}>
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={Boolean(link.end)}
                  className={({ isActive }) =>
                    `site-nav-link ${isActive ? 'active-link' : ''}`
                  }
                  onClick={() => setIsOpen(false)}
                >
                  {t(`nav.links.${link.key}`)}
                </NavLink>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="site-nav-link nav-theme-row"
                onClick={() => {
                  toggleTheme();
                  setIsOpen(false);
                }}
              >
                <FontAwesomeIcon icon={isDark ? faSun : faMoon} />
                {isDark ? t('nav.theme.light') : t('nav.theme.dark')}
              </button>
            </li>
          </ul>

          <div className="site-nav-spacer" />

          <div className="site-nav-actions">
            <LanguageSelector />

            <NavLink
              to="/menu"
              className="site-icon-btn"
              aria-label={t('nav.aria.browseMenu')}
              title={t('nav.aria.browseMenu')}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </NavLink>

            <button
              type="button"
              className="site-icon-btn nav-cart-btn"
              onClick={openDrawer}
              aria-label={t('nav.aria.openCart', { count })}
            >
              <FontAwesomeIcon icon={faCartShopping} />
              {count > 0 && <span className="cart-badge">{count}</span>}
            </button>

            {currentUser && !isGuest ? (
              <div className="account-menu" ref={menuRef}>
                <button
                  type="button"
                  className="account-menu-btn"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                >
                  <Avatar
                    name={displayName}
                    photoURL={currentUser.photoURL}
                    size="sm"
                  />
                  <span className="account-menu-name">{displayName}</span>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className="account-menu-chevron"
                  />
                </button>

                {menuOpen && (
                  <div className="account-dropdown" role="menu">
                    <div className="account-dropdown-head">
                      <strong>{displayName}</strong>
                      <span>{currentUser.email}</span>
                    </div>

                    <NavLink
                      to="/account"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeAll}
                    >
                      <FontAwesomeIcon icon={faUser} /> {t('nav.links.myAccount')}
                    </NavLink>
                    <NavLink
                      to="/account/orders"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeAll}
                    >
                      <FontAwesomeIcon icon={faBoxArchive} /> {t('nav.links.orders')}
                    </NavLink>
                    <NavLink
                      to="/account/favorites"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeAll}
                    >
                      <FontAwesomeIcon icon={faHeart} /> {t('nav.links.favorites')}
                    </NavLink>

                    {isAdmin && (
                      <>
                        <div className="account-dropdown-divider" />
                        <NavLink
                          to="/admin"
                          className="account-dropdown-item is-admin"
                          role="menuitem"
                          onClick={closeAll}
                        >
                          <FontAwesomeIcon icon={faGaugeHigh} /> {t('nav.links.dashboard')}
                        </NavLink>
                      </>
                    )}

                    <div className="account-dropdown-divider" />
                    <button
                      type="button"
                      className="account-dropdown-item is-danger"
                      role="menuitem"
                      onClick={handleLogout}
                    >
                      <FontAwesomeIcon icon={faRightFromBracket} /> {t('nav.links.logout')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <NavLink to="/login" className="contact-btn account-login-btn">
                {t('nav.links.login')}
              </NavLink>
            )}

            <button
              type="button"
              className="site-icon-btn theme-toggle"
              onClick={toggleTheme}
              aria-label={isDark ? t('nav.aria.switchToLight') : t('nav.aria.switchToDark')}
              title={isDark ? t('nav.aria.switchToLight') : t('nav.aria.switchToDark')}
            >
              <FontAwesomeIcon icon={isDark ? faSun : faMoon} />
            </button>

            <button
              type="button"
              className="nav-hamburger"
              onClick={() => setIsOpen((open) => !open)}
              aria-label={t('nav.aria.toggleMenu')}
              aria-expanded={isOpen}
            >
              <FontAwesomeIcon icon={isOpen ? faXmark : faBars} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default NavBar;