import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    signup,
    authError,
    clearError,
  } = useAuth();

  const { showToast } = useToast();

  const navigate = useNavigate();
  const location = useLocation();

  const from =
    location.state?.from || '/account';

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');
    clearError();

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError(
        'Password must be at least 6 characters.'
      );
      return;
    }

    setLoading(true);

    const result = await signup(
      name,
      email,
      password,
      phone,
      address
    );

    setLoading(false);

    if (result.success) {
      showToast(
        'Customer account created successfully!'
      );

      navigate(from, {
        replace: true,
      });
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">
          CUSTOMER SIGN UP
        </h1>
      </div>

      <div className="auth-card">
        <h2>Create Customer Account</h2>

        <p className="auth-subtitle">
          Create your account and start ordering
          delicious pizza.
        </p>

        {(error || authError) && (
          <p className="auth-error">
            {error || authError}
          </p>
        )}

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            required
          />

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            required
          />

          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) =>
              setConfirmPassword(e.target.value)
            }
            required
          />

          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value)
            }
            required
          />

          <input
            type="text"
            placeholder="Default delivery address (optional)"
            value={address}
            onChange={(e) =>
              setAddress(e.target.value)
            }
          />

          <button
            type="submit"
            className="contact-btn"
            disabled={loading}
          >
            {loading
              ? 'Creating account...'
              : 'Create Customer Account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link to="/login/customer">
            Customer Login
          </Link>
        </p>

        <p className="auth-switch">
          Own a restaurant?{' '}
          <Link to="/admin/register">
            Create Admin Account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;