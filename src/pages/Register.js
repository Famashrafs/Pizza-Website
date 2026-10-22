import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function Register() {
  const { t } = useTranslation();
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
      setError(t('auth.errorPasswordsDoNotMatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.errorPasswordTooShort'));
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
      showToast(t('auth.toastCustomerAccountCreated'));

      navigate(from, {
        replace: true,
      });
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">
          {t('auth.pageTitleCustomerSignUp')}
        </h1>
      </div>

      <div className="auth-card">
        <h2>{t('auth.headingCreateCustomerAccount')}</h2>

        <p className="auth-subtitle">
          {t('auth.subtitleCreateCustomerAccount')}
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
            placeholder={t('auth.fieldFullName')}
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            required
          />

          <input
            type="email"
            placeholder={t('auth.fieldEmail')}
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            required
          />

          <input
            type="password"
            placeholder={t('auth.fieldPassword')}
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            required
          />

          <input
            type="password"
            placeholder={t('auth.fieldConfirmPassword')}
            value={confirmPassword}
            onChange={(e) =>
              setConfirmPassword(e.target.value)
            }
            required
          />

          <input
            type="tel"
            placeholder={t('auth.fieldPhoneNumber')}
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value)
            }
            required
          />

          <input
            type="text"
            placeholder={t('auth.fieldDefaultAddress')}
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
              ? t('auth.buttonCreatingAccount')
              : t('auth.headingCreateCustomerAccount')}
          </button>
        </form>

        <p className="auth-switch">
          {t('auth.promptAlreadyHaveAccount')}{' '}
          <Link to="/login/customer">
            {t('auth.customerLogin')}
          </Link>
        </p>

        <p className="auth-switch">
          {t('auth.promptOwnRestaurant')}{' '}
          <Link to="/admin/register">
            {t('auth.createAdminAccount')}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;