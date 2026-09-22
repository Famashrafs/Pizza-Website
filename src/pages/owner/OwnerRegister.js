import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStore, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';

function OwnerRegister({ adminMode = false }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [restaurantName, setRestaurantName] = useState(
    RESTAURANT_SETTINGS.name
  );
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signupOwner, authError, clearError } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    clearError();

    if (password !== confirmPassword) {
      return setFormError('Passwords do not match.');
    }
    if (password.length < 6) {
      return setFormError('Password must be at least 6 characters.');
    }
    if (!restaurantName.trim()) {
      return setFormError('Please enter a restaurant name.');
    }

    setLoading(true);
    const result = await signupOwner(
      name,
      email,
      password,
      restaurantName
    );
    setLoading(false);

    if (result.success) {
      showToast('Welcome! Your restaurant is ready.');
      navigate('/admin', { replace: true });
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">
          {adminMode ? 'ADMIN SIGN UP' : 'OWNER SIGN UP'}
        </h1>
      </div>
      <div className="auth-card">
        <span className="owner-reg-icon">
          <FontAwesomeIcon icon={faStore} />
        </span>
        <h2>{adminMode ? 'Create your admin account' : 'Open your restaurant dashboard'}</h2>
        <p className="auth-subtitle">
          Set up your restaurant account. Orders, menu, customers and analytics
          will live here.
        </p>

        {(formError || authError) && (
          <p className="auth-error">{formError || authError}</p>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
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
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Restaurant name"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            required
          />
          <button type="submit" className="contact-btn" disabled={loading}>
            {loading ? 'Setting up your restaurant...' : 'Create restaurant account'}{' '}
            {!loading && <FontAwesomeIcon icon={faArrowRight} />}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link to={adminMode ? '/admin/login' : '/login'}>
            {adminMode ? 'Admin login' : 'Login'}
          </Link>
        </p>
        <p className="dash-form-note" style={{ textAlign: 'center' }}>
          Customers continue to manage their account from their normal account
          page.
        </p>
      </div>
    </div>
  );
}

export default OwnerRegister;