import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheckCircle,
  faTriangleExclamation,
  faPenToSquare,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import Avatar from './Avatar';

function AccountHeader({ account }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="dash-header">
      <div className="dash-header-identity">
        <Avatar
          name={account?.name}
          photoURL={account?.photoURL}
          size="lg"
        />
        <div>
          <h1>{account?.name || t('account.myAccount')}</h1>
          <p className="dash-header-email">{account?.email}</p>
          {account?.emailVerified ? (
            <span className="dash-verify-badge verified">
              <FontAwesomeIcon icon={faCheckCircle} /> {t('account.emailVerified')}
            </span>
          ) : (
            <span className="dash-verify-badge unverified">
              <FontAwesomeIcon icon={faTriangleExclamation} />{' '}
              {t('account.emailNotVerified')}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="dash-edit-btn"
        onClick={() => navigate('/account/profile')}
      >
        <FontAwesomeIcon icon={faPenToSquare} /> {t('account.editProfile')}
      </button>
    </div>
  );
}

export default AccountHeader;
