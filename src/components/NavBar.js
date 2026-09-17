import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCartShopping } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';

function NavBar(props) {
  const [isOpen, setIsOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const { count, openDrawer } = useCart();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      showToast('You have been logged out.');
      navigate('/');
    }
  };

  return (
    <nav className={`nav-bar ${props.isScrolled ? "sticky" : ""}`}>
      <NavLink to="/" className="logo">PIZZA</NavLink>
      <div className={`menu-icon ${isOpen ? 'open' : ''}`} onClick={toggleMenu}>
        <div className='bars'>
          <div className="bar"></div>
          <div className="bar"></div>
          <div className="bar"></div>
        </div>
        <h2>Menu</h2>
      </div>
      <ul className={`nav-links ${isOpen ? 'open' : ''}`}>
        <li>
          <NavLink 
            to="/" 
            className={({ isActive }) => isActive ? 'active-link' : ''} 
            end
          >
            Home
          </NavLink>
        </li>
        <li>
          <NavLink 
            to="/menu" 
            className={({ isActive }) => isActive ? 'active-link' : ''}
          >
            Menu
          </NavLink>
        </li>
        <li>
          <NavLink 
            to="/services" 
            className={({ isActive }) => isActive ? 'active-link' : ''}
          >
            Services
          </NavLink>
        </li>
        <li>
          <NavLink 
            to="/blog" 
            className={({ isActive }) => isActive ? 'active-link' : ''}
          >
            Blog
          </NavLink>
        </li>
        <li>
          <NavLink 
            to="/about" 
            className={({ isActive }) => isActive ? 'active-link' : ''}
          >
            About
          </NavLink>
        </li>
        <li>
          <NavLink 
            to="/contact" 
            className={({ isActive }) => isActive ? 'active-link' : ''}
          >
            Contact
          </NavLink>
        </li>
        <li>
          <button
            type="button"
            className="cart-link nav-cart-btn"
            onClick={() => {
              setIsOpen(false);
              openDrawer();
            }}
            aria-label={`Open cart, ${count} ${count === 1 ? 'item' : 'items'}`}
          >
            <FontAwesomeIcon icon={faCartShopping} />
            <span className="cart-label">Cart</span>
            {count > 0 && <span className="cart-badge">{count}</span>}
          </button>
        </li>
        {currentUser ? (
          <>
            <li>
              <NavLink
                to="/account"
                className={({ isActive }) => isActive ? 'active-link' : ''}
              >
                Account
              </NavLink>
            </li>
            <li>
              <button className="nav-btn" onClick={handleLogout}>
                Log out
              </button>
            </li>
          </>
        ) : (
          <li>
            <NavLink
              to="/login"
              className={({ isActive }) => isActive ? 'active-link' : ''}
            >
              Login
            </NavLink>
          </li>
        )}
      </ul>
    </nav>
  );
}

export default NavBar;
