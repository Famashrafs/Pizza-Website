import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

function AuthPrompt({ title, message, fullPage }) {
  const { t } = useTranslation();
  const location = useLocation();
  const from = location.pathname;

  return (
    <div className={`auth-prompt ${fullPage ? 'auth-prompt-full' : ''}`}>
      <div className="auth-prompt-card">
        <span className="auth-prompt-icon">
          <FontAwesomeIcon icon={faLock} />
        </span>
        <h2>{title || t('auth.promptSignInRequiredTitle')}</h2>
        <p>
          {message || t('auth.promptSignInRequiredText')}
        </p>
        <div className="auth-prompt-actions">
          <Link to="/login" state={{ from }} className="contact-btn">
            {t('auth.buttonLogIn')}
          </Link>
          <Link to="/register" className="menu-btn">
            {t('auth.createAccount')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AuthPrompt;