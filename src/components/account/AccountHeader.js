import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheckCircle,
  faTriangleExclamation,
  faPenToSquare,
} from '@fortawesome/free-solid-svg-icons';
import Avatar from './Avatar';

function AccountHeader({ account }) {
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
          <h1>{account?.name || 'My Account'}</h1>
          <p className="dash-header-email">{account?.email}</p>
          {account?.emailVerified ? (
            <span className="dash-verify-badge verified">
              <FontAwesomeIcon icon={faCheckCircle} /> Email verified
            </span>
          ) : (
            <span className="dash-verify-badge unverified">
              <FontAwesomeIcon icon={faTriangleExclamation} /> Email not verified
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="dash-edit-btn"
        onClick={() => navigate('/account/profile')}
      >
        <FontAwesomeIcon icon={faPenToSquare} /> Edit Profile
      </button>
    </div>
  );
}

export default AccountHeader;