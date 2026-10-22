import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faStore,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';

function OwnerRegister() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] =
    useState('');
  const [restaurantName, setRestaurantName] =
    useState(RESTAURANT_SETTINGS.name);

  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    signupOwner,
    authError,
    clearError,
  } = useAuth();

  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    setFormError('');
    clearError();

    if (password !== confirmPassword) {
      setFormError(t('auth.errorPasswordsDoNotMatch'));
      return;
    }

    if (password.length < 6) {
      setFormError(t('auth.errorPasswordTooShort'));
      return;
    }

    if (!restaurantName.trim()) {
      setFormError(t('auth.errorRestaurantNameRequired'));
      return;
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
      showToast(t('auth.toastRestaurantAccountCreated'));

      navigate('/admin', {
        replace: true,
      });
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">
          {t('auth.pageTitleAdminSignUp')}
        </h1>
      </div>

      <div className="auth-card">
        <span className="owner-reg-icon">
          <FontAwesomeIcon icon={faStore} />
        </span>

        <h2>
          {t('auth.headingCreateRestaurantAdminAccount')}
        </h2>

        <p className="auth-subtitle">
          {t('auth.subtitleCreateRestaurantAdminAccount')}
        </p>

        {(formError || authError) && (
          <p className="auth-error">
            {formError || authError}
          </p>
        )}

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          <input
            type="text"
            placeholder={t('auth.fieldYourFullName')}
            value={name}
            onChange={(e) =>
              setName(e.target.value)
            }
            required
          />

          <input
            type="email"
            placeholder={t('auth.fieldAdminEmail')}
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
            type="text"
            placeholder={t('auth.fieldRestaurantName')}
            value={restaurantName}
            onChange={(e) =>
              setRestaurantName(e.target.value)
            }
            required
          />

          <button
            type="submit"
            className="contact-btn"
            disabled={loading}
          >
            {loading
              ? t('auth.buttonCreatingRestaurant')
              : t('auth.createRestaurantAccount')}

            {!loading && (
              <FontAwesomeIcon
                icon={faArrowRight}
              />
            )}
          </button>
        </form>

        <p className="auth-switch">
          {t('auth.promptAlreadyHaveAdminAccount')}{' '}
          <Link to="/admin/login">
            {t('auth.adminLogin')}
          </Link>
        </p>

        <p className="auth-switch">
          {t('auth.promptAreYouCustomer')}{' '}
          <Link to="/register/customer">
            {t('auth.linkCustomerSignUp')}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default OwnerRegister;