import React, { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSpinner,
  faCheckCircle,
  faTriangleExclamation,
  faEnvelope,
  faKey,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ProfileImageUploader from '../../components/account/ProfileImageUploader';
import SectionTitle from '../../components/account/SectionTitle';
import {
  getAddresses,
  setDefaultAddress,
  normalizeAccount,
} from '../../services/accountService';

function ProfilePage() {
  const { currentUser, updateProfileData, resendVerificationEmail, changeEmail } =
    useAuth();
  const { showToast } = useToast();
  const { account } = useOutletContext();

  const uid = currentUser?.uid;
  const addresses = useMemo(() => (uid ? getAddresses(uid) : []), [uid]);

  const [name, setName] = useState(account.name || '');
  const [saving, setSaving] = useState(false);

  const [emailMode, setEmailMode] = useState('view'); // view | change
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const result = await updateProfileData({ displayName: name.trim() });
    setSaving(false);
    if (result.success) {
      showToast('Profile updated successfully.');
    } else {
      showToast(result.error || 'Unable to update your profile.', 'error');
    }
  };

  const handleSavePhoto = async (dataUrl) => {
    setPhotoSaving(true);
    const result = await updateProfileData({ photoURL: dataUrl });
    setPhotoSaving(false);
    if (result.success) {
      showToast('Profile picture updated.');
    } else {
      setPhotoError(result.error || 'Unable to update your profile picture.');
    }
  };

  const handleRemovePhoto = async () => {
    const result = await updateProfileData({ photoURL: '' });
    if (result.success) showToast('Profile picture removed.');
  };

  const handleVerifyEmail = async () => {
    setVerifyBusy(true);
    const result = await resendVerificationEmail();
    setVerifyBusy(false);
    if (result.success) {
      showToast('Verification email sent. Check your inbox.');
    } else {
      showToast(
        result.error || 'Unable to send the verification email.',
        'error'
      );
    }
  };

  const handleChangeEmail = async (event) => {
    event.preventDefault();
    if (!newEmail.trim()) return;
    setEmailBusy(true);
    const result = await changeEmail(newEmail.trim(), emailPassword);
    setEmailBusy(false);
    if (result.success) {
      showToast(
        'Email updated. A verification email was sent to your new address.'
      );
      setEmailMode('view');
      setNewEmail('');
      setEmailPassword('');
    } else {
      showToast(result.error || 'Unable to update your email.', 'error');
    }
  };

  const handleSetDefaultAddress = (id) => {
    setDefaultAddress(uid, id);
    showToast('Default address updated.');
  };

  const normalized = normalizeAccount(uid, currentUser);

  return (
    <div className="dash-section">
      <SectionTitle title="Profile" subtitle="Manage your personal information" />

      <div className="dash-card dash-profile-layout">
        <div className="dash-profile-photo">
          <ProfileImageUploader
            photoURL={normalized.photoURL}
            onSave={handleSavePhoto}
            onRemove={handleRemovePhoto}
          />
          {photoError && (
            <p className="dash-field-error">{photoError}</p>
          )}
          {photoSaving && (
            <p className="dash-form-note">
              <FontAwesomeIcon icon={faSpinner} spin /> Uploading…
            </p>
          )}
        </div>

        <form onSubmit={handleSaveProfile} className="dash-form">
          <div className="dash-field">
            <label htmlFor="profile-name">Full name</label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <div className="dash-field">
            <label htmlFor="profile-phone">Phone number</label>
            <div className="dash-phone-summary">
              <input
                id="profile-phone"
                type="text"
                value={normalized.phone}
                readOnly
                tabIndex={-1}
                aria-label="Phone number"
              />
              {normalized.phoneVerified ? (
                <span className="dash-verify-badge verified">
                  <FontAwesomeIcon icon={faCheckCircle} /> Verified
                </span>
              ) : (
                <Link
                  to="/account/security"
                  className="dash-inline-verify"
                >
                  <FontAwesomeIcon icon={faTriangleExclamation} /> Verify phone
                  to receive SMS updates
                </Link>
              )}
            </div>
            <p className="dash-form-note">
              Phone verification lives under Security.
            </p>
          </div>

          <div className="dash-field">
            <label>Default address</label>
            {addresses.length === 0 ? (
              <p className="dash-field-error">
                No saved addresses yet.{' '}
                <Link to="/account/addresses">Add an address</Link> for faster
                checkout.
              </p>
            ) : (
              <select
                value={
                  normalized.defaultAddressId ||
                  (addresses[0] && addresses[0].id) ||
                  ''
                }
                onChange={(event) => handleSetDefaultAddress(event.target.value)}
              >
                {addresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.label} — {address.address}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="submit"
            className="contact-btn dash-btn-sm"
            disabled={saving}
          >
            {saving ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin /> Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </form>
      </div>

      <div className="dash-card dash-email-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faEnvelope} /> Email
          </h3>
        </div>
        <div className="dash-email-row">
          <div>
            <p className="dash-email-address">{normalized.email}</p>
            {normalized.emailVerified ? (
              <span className="dash-verify-badge verified">
                <FontAwesomeIcon icon={faCheckCircle} /> Email verified
              </span>
            ) : (
              <span className="dash-verify-badge unverified">
                <FontAwesomeIcon icon={faTriangleExclamation} /> Email not
                verified
              </span>
            )}
          </div>
          <div className="dash-email-actions">
            {!normalized.emailVerified && (
              <button
                type="button"
                className="menu-btn dash-btn-sm"
                onClick={handleVerifyEmail}
                disabled={verifyBusy}
              >
                {verifyBusy ? 'Sending…' : 'Verify Email'}
              </button>
            )}
            <button
              type="button"
              className="menu-btn dash-btn-sm"
              onClick={() => setEmailMode(emailMode === 'view' ? 'change' : 'view')}
            >
              {emailMode === 'view' ? 'Change Email' : 'Cancel'}
            </button>
          </div>
        </div>

        {emailMode === 'change' && (
          <form onSubmit={handleChangeEmail} className="dash-form dash-email-change">
            <p className="dash-form-note">
              <FontAwesomeIcon icon={faKey} /> To change your email you must
              confirm with your current password. Your new address will not be
              treated as verified until you confirm it.
            </p>
            <div className="dash-field">
              <label htmlFor="new-email">New email</label>
              <input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                required
              />
            </div>
            <div className="dash-field">
              <label htmlFor="email-password">Current password</label>
              <input
                id="email-password"
                type="password"
                value={emailPassword}
                onChange={(event) => setEmailPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              className="contact-btn dash-btn-sm"
              disabled={emailBusy}
            >
              {emailBusy ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin /> Updating…
                </>
              ) : (
                'Update Email'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;