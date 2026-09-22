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
import Avatar from './account/Avatar';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/menu', label: 'Menu' },
  { to: '/offers', label: 'Offers' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

function NavBar({ isScrolled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { currentUser, isOwner, logout } = useAuth();
  const { count, openDrawer } = useCart();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
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
      showToast('You have been logged out.');
      navigate('/');
    }
  };

  const displayName =
    currentUser?.displayName ||
    currentUser?.email?.split('@')[0] ||
    'My account';

  return (
    <nav
      className={`site-nav ${isScrolled ? 'is-scrolled' : ''}`}
      aria-label="Main navigation"
    >
      <div className="container">
        <div className="site-nav-inner">
          <NavLink to="/" className="site-logo" aria-label="Pizza home">
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
                  {link.label}
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
                {isDark ? 'Light mode' : 'Dark mode'}
              </button>
            </li>
          </ul>

          <div className="site-nav-spacer" />

          <div className="site-nav-actions">
            <NavLink
              to="/menu"
              className="site-icon-btn"
              aria-label="Browse the menu"
              title="Browse the menu"
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </NavLink>

            <button
              type="button"
              className="site-icon-btn nav-cart-btn"
              onClick={openDrawer}
              aria-label={`Open cart, ${count} ${count === 1 ? 'item' : 'items'}`}
            >
              <FontAwesomeIcon icon={faCartShopping} />
              {count > 0 && <span className="cart-badge">{count}</span>}
            </button>

            {currentUser ? (
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
                      <FontAwesomeIcon icon={faUser} /> My account
                    </NavLink>
                    <NavLink
                      to="/account/orders"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeAll}
                    >
                      <FontAwesomeIcon icon={faBoxArchive} /> Orders
                    </NavLink>
                    <NavLink
                      to="/account/favorites"
                      className="account-dropdown-item"
                      role="menuitem"
                      onClick={closeAll}
                    >
                      <FontAwesomeIcon icon={faHeart} /> Favorites
                    </NavLink>

                    {isOwner && (
                      <>
                        <div className="account-dropdown-divider" />
                        <NavLink
                          to="/admin"
                          className="account-dropdown-item is-admin"
                          role="menuitem"
                          onClick={closeAll}
                        >
                          <FontAwesomeIcon icon={faGaugeHigh} /> Dashboard
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
                      <FontAwesomeIcon icon={faRightFromBracket} /> Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <NavLink to="/login" className="contact-btn account-login-btn">
                Log in
              </NavLink>
            )}

            <button
              type="button"
              className="site-icon-btn theme-toggle"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <FontAwesomeIcon icon={isDark ? faSun : faMoon} />
            </button>

            <button
              type="button"
              className="nav-hamburger"
              onClick={() => setIsOpen((open) => !open)}
              aria-label="Toggle navigation menu"
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