import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { forgotPassword, authError } = useAuth();
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await forgotPassword(email);
    if (result.success) {
      setSent(true);
      showToast(t('auth.toastResetEmailSent'));
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">
          {t('auth.pageTitleResetPassword')}
        </h1>
      </div>
      <div className="auth-card">
        <h2>{t('auth.headingForgotPassword')}</h2>
        <p className="auth-subtitle">
          {t('auth.subtitleForgotPassword')}
        </p>
        {sent ? (
          <>
            <div className="auth-success">
              <Trans
                i18nKey="auth.resetLinkSent"
                values={{ email }}
                components={{ strong: <strong /> }}
              />
            </div>
            <Link to="/login" className="contact-btn empty-cart-btn">
              {t('auth.buttonBackToLogin')}
            </Link>
          </>
        ) : (
          <>
            {authError && <p className="auth-error">{authError}</p>}
            <form className="auth-form" onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder={t('auth.fieldEmail')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="contact-btn">
                {t('auth.buttonSendResetLink')}
              </button>
            </form>
            <p className="auth-switch">
              {t('auth.promptRemembered')}{' '}
              <Link to="/login">{t('auth.linkLogin')}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default ForgotPassword;