import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';

function AuthPrompt({ title, message, fullPage }) {
  const location = useLocation();
  const from = location.pathname;

  return (
    <div className={`auth-prompt ${fullPage ? 'auth-prompt-full' : ''}`}>
      <div className="auth-prompt-card">
        <span className="auth-prompt-icon">
          <FontAwesomeIcon icon={faLock} />
        </span>
        <h2>{title || 'Sign in required'}</h2>
        <p>
          {message ||
            'Log in to your account to continue. Your cart is saved so you can finish anytime.'}
        </p>
        <div className="auth-prompt-actions">
          <Link to="/login" state={{ from }} className="contact-btn">
            Log In
          </Link>
          <Link to="/register" className="menu-btn">
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AuthPrompt;