import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { auth } from '../firebase';
import { getUserData } from '../services/storage';
import { normalizeRole, roleHasAdminAccess } from '../config/roles';

// After a successful sign-in, owners are taken to their dashboard while other
// users continue to the page they were heading to (default: /account).
function resolvePostLoginPath(from) {
  const user = auth.currentUser;
  const profile = user ? getUserData(user.uid) : null;
  const role = normalizeRole(profile?.role);
  return roleHasAdminAccess(role) ? '/admin' : from;
}

function Login({ adminMode = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [action, setAction] = useState(null);
  const { login, loginWithGoogle, authError, clearError } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || (adminMode ? '/admin' : '/account');

  // In admin mode only admin-level accounts are allowed through; anyone else is
  // sent to the normal customer account area.
  const completeLogin = (successMessage) => {
    const path = resolvePostLoginPath(from);
    if (adminMode && path !== '/admin') {
      showToast('This account does not have admin access.', 'error');
      navigate('/account', { replace: true });
      return;
    }
    showToast(successMessage);
    navigate(path, { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAction('email');
    const result = await login(email, password, remember);
    setAction(null);
    if (result.success) {
      completeLogin('Welcome back!');
    }
  };

  const handleGoogle = async () => {
    clearError();
    setAction('google');
    const result = await loginWithGoogle();
    setAction(null);
    if (result.success) {
      completeLogin('Signed in with Google!');
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">{adminMode ? 'ADMIN LOGIN' : 'LOGIN'}</h1>
      </div>
      <div className="auth-card">
        <h2>{adminMode ? 'Restaurant Admin' : 'Welcome Back'}</h2>
        <p className="auth-subtitle">
          {adminMode
            ? 'Sign in with your admin account to open the dashboard'
            : 'Log in to your account to continue'}
        </p>
        {authError && <p className="auth-error">{authError}</p>}
        <form className="auth-form" onSubmit={handleSubmit}>
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
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember me
            </label>
            <Link to="/forgot-password" className="auth-link">
              Forgot password?
            </Link>
          </div>
          <button
            type="submit"
            className="contact-btn"
            disabled={action !== null}
          >
            {action === 'email' ? 'Logging in...' : 'Login'}
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
          <FontAwesomeIcon icon={faGoogle} className="google-icon" />
          {action === 'google' ? 'Signing in...' : 'Continue with Google'}
        </button>
        {adminMode ? (
          <p className="auth-switch">
            New restaurant?{' '}
            <Link to="/admin/register">Create an admin account</Link>
          </p>
        ) : (
          <>
            <p className="auth-switch">
              Don't have an account? <Link to="/register">Sign up</Link>
            </p>
            <p className="auth-switch">
              Restaurant owner? <Link to="/admin/login">Log in as admin</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default Login;