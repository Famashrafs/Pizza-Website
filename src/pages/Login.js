import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { roleHasAdminAccess } from '../config/roles';

function Login({ adminMode = false }) {
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
          'This is a customer account. Please use a restaurant admin account.',
          'error'
        );

        navigate('/admin/login', { replace: true });
        return;
      }

      showToast('Welcome back, Admin!');
      navigate('/admin', { replace: true });
      return;
    }

    // CUSTOMER LOGIN
    if (isAdmin) {
      showToast(
        'This is a restaurant admin account. Please use Admin Login.',
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
        adminMode ? 'Welcome back, Admin!' : 'Welcome back!',
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
          ? 'Welcome back, Admin!'
          : 'Signed in with Google!',
        result.value?.profile
      );
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">
          {adminMode ? 'ADMIN LOGIN' : 'CUSTOMER LOGIN'}
        </h1>
      </div>

      <div className="auth-card">
        <h2>
          {adminMode
            ? 'Restaurant Admin'
            : 'Welcome Back'}
        </h2>

        <p className="auth-subtitle">
          {adminMode
            ? 'Sign in to manage your restaurant'
            : 'Sign in to order pizza and manage your account'}
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
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
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
              Remember me
            </label>

            <Link
              to="/forgot-password"
              className="auth-link"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="contact-btn"
            disabled={action !== null}
          >
            {action === 'email'
              ? 'Logging in...'
              : adminMode
              ? 'Admin Login'
              : 'Customer Login'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
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
            ? 'Signing in...'
            : 'Continue with Google'}
        </button>

        {adminMode ? (
          <>
            <p className="auth-switch">
              Don't have a restaurant account?{' '}
              <Link to="/admin/register">
                Create Admin Account
              </Link>
            </p>

            <p className="auth-switch">
              Are you a customer?{' '}
              <Link to="/login/customer">
                Customer Login
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="auth-switch">
              Don't have an account?{' '}
              <Link to="/register/customer">
                Create Customer Account
              </Link>
            </p>

            <p className="auth-switch">
              Restaurant owner?{' '}
              <Link to="/admin/login">
                Admin Login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default Login;