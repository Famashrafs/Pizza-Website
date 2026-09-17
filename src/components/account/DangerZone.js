import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTriangleExclamation,
  faRightFromBracket,
  faSpinner,
  faUserXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

function DeleteAccountModal({ onCancel, onConfirm }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!password) {
      setError('Please enter your password to confirm.');
      return;
    }
    setBusy(true);
    setError('');
    await onConfirm(password);
    setBusy(false);
  };

  return (
    <div className="modal-overlay confirm-overlay">
      <div
        className="confirm-dialog danger-zone-dialog"
        role="alertdialog"
        aria-modal="true"
      >
        <FontAwesomeIcon icon={faTriangleExclamation} className="confirm-icon danger" />
        <h2>Delete your account?</h2>
        <p>
          This permanently deletes <strong>your profile, addresses and payment
          methods</strong> and signs you out. Your order history remains in our
          records for business reasons.
        </p>
        <label className="danger-zone-label" htmlFor="confirm-password">
          Enter your password to confirm
        </label>
        <div className="dash-password-input">
          <input
            id="confirm-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </div>
        {error && <p className="dash-field-error">{error}</p>}
        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" onClick={onCancel}>
            Keep my account
          </button>
          <button
            type="button"
            className="confirm-confirm danger"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin /> Deleting…
              </>
            ) : (
              'Delete my account'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function DangerZone() {
  const { logout, deleteAccount } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      showToast('You have been logged out.');
      navigate('/');
    } else {
      showToast(result.error || 'Unable to log out.', 'error');
    }
  };

  const handleDeleteAccount = async (password) => {
    const result = await deleteAccount(password);
    if (result.success) {
      setConfirmingDelete(false);
      showToast('Your account has been deleted.');
      navigate('/');
    } else {
      showToast(
        result.error || 'Unable to delete your account. Please try again.',
        'error'
      );
    }
  };

  return (
    <section className="dash-card danger-zone">
      <div className="dash-card-head">
        <h3>
          <FontAwesomeIcon icon={faUserXmark} /> Danger Zone
        </h3>
      </div>
      <div className="danger-zone-row">
        <div>
          <p className="danger-zone-title">Log out of this device</p>
          <p className="danger-zone-desc">
            Sign out of your account on this browser.
          </p>
        </div>
        <button type="button" className="menu-btn dash-btn-sm" onClick={handleLogout}>
          <FontAwesomeIcon icon={faRightFromBracket} /> Log out
        </button>
      </div>
      <div className="danger-zone-row">
        <div>
          <p className="danger-zone-title">Delete your account</p>
          <p className="danger-zone-desc">
            Permanently remove your profile and personal data. This cannot be
            undone.
          </p>
        </div>
        <button
          type="button"
          className="menu-btn dash-btn-sm is-danger"
          onClick={() => setConfirmingDelete(true)}
        >
          Delete account
        </button>
      </div>

      {confirmingDelete && (
        <DeleteAccountModal
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={handleDeleteAccount}
        />
      )}
    </section>
  );
}

export default DangerZone;