import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { roleHasAdminAccess } from '../config/roles';

function Login({ adminMode = false }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [action, setAction] = useState(null);

  const {
    login,
    loginWithGoogle,
    authError,
    clearError,
    userProfile,
  } = useAuth();

  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const from =
    location.state?.from ||
    (adminMode ? '/admin' : '/account');

  const completeLogin = (successMessage, profile) => {
    const resolvedProfile = profile || userProfile;
    const isAdmin = roleHasAdminAccess(resolvedProfile?.role);

    // ADMIN LOGIN
    if (adminMode) {
      if (!isAdmin) {
        showToast(
          t('auth.errorCustomerAccountInAdminMode'),
          'error'
        );

        navigate('/admin/login', { replace: true });
        return;
      }

      showToast(t('auth.toastWelcomeBackAdmin'));
      navigate('/admin', { replace: true });
      return;
    }

    // CUSTOMER LOGIN
    if (isAdmin) {
      showToast(
        t('auth.errorAdminAccountInCustomerMode'),
        'error'
      );

      navigate('/admin/login', { replace: true });
      return;
    }

    showToast(successMessage);
    navigate(from, { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    clearError();
    setAction('email');

    const result = await login(email, password, remember);

    setAction(null);

    if (result.success) {
      completeLogin(
        adminMode
          ? t('auth.toastWelcomeBackAdmin')
          : t('auth.toastWelcomeBack'),
        result.value?.profile
      );
    }
  };

  const handleGoogle = async () => {
    clearError();
    setAction('google');

    const result = await loginWithGoogle();

    setAction(null);

    if (result.success) {
      completeLogin(
        adminMode
          ? t('auth.toastWelcomeBackAdmin')
          : t('auth.toastSignedInWithGoogle'),
        result.value?.profile
      );
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">
          {adminMode
            ? t('auth.pageTitleAdminLogin')
            : t('auth.pageTitleCustomerLogin')}
        </h1>
      </div>

      <div className="auth-card">
        <h2>
          {adminMode
            ? t('auth.headingRestaurantAdmin')
            : t('auth.headingWelcomeBack')}
        </h2>

        <p className="auth-subtitle">
          {adminMode
            ? t('auth.subtitleSignInToManageRestaurant')
            : t('auth.subtitleSignInToOrder')}
        </p>

        {authError && (
          <p className="auth-error">
            {authError}
          </p>
        )}

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          <input
            type="email"
            placeholder={t('auth.fieldEmail')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder={t('auth.fieldPassword')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="auth-row">
            <label className="auth-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) =>
                  setRemember(e.target.checked)
                }
              />
              {t('auth.labelRememberMe')}
            </label>

            <Link
              to="/forgot-password"
              className="auth-link"
            >
              {t('auth.linkForgotPassword')}
            </Link>
          </div>

          <button
            type="submit"
            className="contact-btn"
            disabled={action !== null}
          >
            {action === 'email'
              ? t('auth.buttonLoggingIn')
              : adminMode
              ? t('auth.adminLogin')
              : t('auth.customerLogin')}
          </button>
        </form>

        <div className="auth-divider">
          <span>{t('auth.dividerOr')}</span>
        </div>

        <button
          type="button"
          className="google-btn"
          onClick={handleGoogle}
          disabled={action !== null}
        >
          <FontAwesomeIcon
            icon={faGoogle}
            className="google-icon"
          />

          {action === 'google'
            ? t('auth.buttonSigningIn')
            : t('auth.buttonContinueWithGoogle')}
        </button>

        {adminMode ? (
          <>
            <p className="auth-switch">
              {t('auth.promptNoRestaurantAccount')}{' '}
              <Link to="/admin/register">
                {t('auth.createAdminAccount')}
              </Link>
            </p>

            <p className="auth-switch">
              {t('auth.promptAreYouCustomer')}{' '}
              <Link to="/login/customer">
                {t('auth.customerLogin')}
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="auth-switch">
              {t('auth.promptNoAccount')}{' '}
              <Link to="/register/customer">
                {t('auth.headingCreateCustomerAccount')}
              </Link>
            </p>

            <p className="auth-switch">
              {t('auth.promptRestaurantOwner')}{' '}
              <Link to="/admin/login">
                {t('auth.adminLogin')}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default Login;