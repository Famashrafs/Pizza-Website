import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTriangleExclamation,
  faRightFromBracket,
  faSpinner,
  faUserXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

function DeleteAccountModal({ onCancel, onConfirm }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!password) {
      setError(t('account.errorPasswordConfirm'));
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
        <h2>{t('account.deleteAccountTitle')}</h2>
        <p>{t('account.deleteAccountBody')}</p>
        <label className="danger-zone-label" htmlFor="confirm-password">
          {t('account.enterPasswordToConfirm')}
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
            {t('account.keepMyAccount')}
          </button>
          <button
            type="button"
            className="confirm-confirm danger"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin /> {t('account.deleting')}
              </>
            ) : (
              t('account.deleteMyAccount')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function DangerZone() {
  const { t } = useTranslation();
  const { logout, deleteAccount } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      showToast(t('nav.messages.loggedOut'));
      navigate('/');
    } else {
      showToast(result.error || t('account.toastLogoutFailed'), 'error');
    }
  };

  const handleDeleteAccount = async (password) => {
    const result = await deleteAccount(password);
    if (result.success) {
      setConfirmingDelete(false);
      showToast(t('account.toastAccountDeleted'));
      navigate('/');
    } else {
      showToast(
        result.error || t('account.toastDeleteAccountFailed'),
        'error'
      );
    }
  };

  return (
    <section className="dash-card danger-zone">
      <div className="dash-card-head">
        <h3>
          <FontAwesomeIcon icon={faUserXmark} /> {t('account.dangerZoneTitle')}
        </h3>
      </div>
      <div className="danger-zone-row">
        <div>
          <p className="danger-zone-title">{t('account.logOutDevice')}</p>
          <p className="danger-zone-desc">
            {t('account.logOutDeviceDesc')}
          </p>
        </div>
        <button type="button" className="menu-btn dash-btn-sm" onClick={handleLogout}>
          <FontAwesomeIcon icon={faRightFromBracket} /> {t('nav.links.logout')}
        </button>
      </div>
      <div className="danger-zone-row">
        <div>
          <p className="danger-zone-title">{t('account.deleteYourAccount')}</p>
          <p className="danger-zone-desc">
            {t('account.deleteAccountDesc')}
          </p>
        </div>
        <button
          type="button"
          className="menu-btn dash-btn-sm is-danger"
          onClick={() => setConfirmingDelete(true)}
        >
          {t('account.deleteAccountButton')}
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
