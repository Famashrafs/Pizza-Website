import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUser,
  faStore,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

function AuthChoice() {
  const { t } = useTranslation();

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">
          {t('auth.pageTitleLogin')}
        </h1>
      </div>

      <div className="auth-card">
        <h2>
          {t('auth.headingWelcomeToPizza', {
            name: t('common.app.name'),
          })}
        </h2>

        <p className="auth-subtitle">
          {t('auth.subtitleChooseHowToContinue')}
        </p>

        <div className="auth-choice-grid">
          <Link
            to="/login/customer"
            className="auth-choice-card"
          >
            <FontAwesomeIcon
              icon={faUser}
              className="auth-choice-icon"
            />

            <h3>{t('auth.choiceCustomerTitle')}</h3>

            <p>
              {t('auth.choiceCustomerText')}
            </p>

            <span>
              {t('auth.choiceCustomerCta')}
            </span>
          </Link>

          <Link
            to="/admin/login"
            className="auth-choice-card"
          >
            <FontAwesomeIcon
              icon={faStore}
              className="auth-choice-icon"
            />

            <h3>{t('auth.choiceAdminTitle')}</h3>

            <p>
              {t('auth.choiceAdminText')}
            </p>

            <span>
              {t('auth.choiceAdminCta')}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AuthChoice;