import React, { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSpinner,
  faCheckCircle,
  faTriangleExclamation,
  faEnvelope,
  faKey,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ProfileImageUploader from '../../components/account/ProfileImageUploader';
import SectionTitle from '../../components/account/SectionTitle';
import { commitImagePipeline } from '../../services/imagePipeline';
import {
  IMAGE_KINDS,
  getProfileImageSignedUrl,
  uploadImageAsset,
} from '../../services/imageService';
import {
  getAddresses,
  setDefaultAddress,
  normalizeAccount,
} from '../../services/accountService';

function ProfilePage() {
  const { t } = useTranslation();
  const { currentUser, userProfile, updateProfileData, resendVerificationEmail, changeEmail } =
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
  const [signedPhotoURL, setSignedPhotoURL] = useState('');

  const normalized = normalizeAccount(uid, currentUser, userProfile);

  // Private Supabase profile images are stored as a stable path in Firestore.
  // Resolve a short-lived signed URL only for display; never persist that URL.
  useEffect(() => {
    let active = true;
    const path = normalized.photoPath;
    if (!path) {
      setSignedPhotoURL('');
      return undefined;
    }

    getProfileImageSignedUrl(path).then(
      (result) => {
        if (active) setSignedPhotoURL(result.url || '');
      },
      () => {
        if (active) setSignedPhotoURL('');
      }
    );
    return () => {
      active = false;
    };
  }, [normalized.photoPath]);

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const result = await updateProfileData({ displayName: name.trim() });
    setSaving(false);
    if (result.success) {
      showToast(t('account.toastProfileUpdated'));
    } else {
      showToast(result.error || t('account.toastProfileUpdateFailed'), 'error');
    }
  };

  const handleSavePhoto = async (file, { onProgress } = {}) => {
    setPhotoSaving(true);
    setPhotoError('');
    try {
      await commitImagePipeline({
        changes: [
          {
            key: 'photo',
            upload: () =>
              uploadImageAsset(file, {
                kind: IMAGE_KINDS.CUSTOMER_PROFILE,
                ownerUid: uid,
                onProgress,
              }),
            oldUrl: normalized.photoPath,
          },
        ],
        // Firestore keeps only the canonical private object path. The
        // expiring signed URL is resolved separately for display.
        save: (images) => updateProfileData({ photoPath: images.photo }),
      });
      showToast(t('account.toastProfilePictureUpdated'));
    } catch (err) {
      setPhotoError(
        ['image/not-configured', 'image/supabase-not-configured'].includes(err.code)
          ? t('account.imageStorageNotConfigured')
          : err.message || t('account.toastProfilePictureFailed')
      );
      throw err;
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoError('');
    try {
      await commitImagePipeline({
        changes: [
          {
            key: 'photo',
            value: '',
            oldUrl: normalized.photoPath,
          },
        ],
        // Clearing the path removes the reference without deleting the object.
        // The old file may still be referenced elsewhere and can only be
        // removed through an explicit, separately authorized deletion.
        save: (images) => updateProfileData({ photoPath: images.photo }),
      });
      setSignedPhotoURL('');
      showToast(t('account.toastProfilePictureRemoved'));
    } catch (err) {
      setPhotoError(err.message || t('account.toastProfilePictureFailed'));
      throw err;
    }
  };

  const handleVerifyEmail = async () => {
    setVerifyBusy(true);
    const result = await resendVerificationEmail();
    setVerifyBusy(false);
    if (result.success) {
      showToast(t('account.toastVerificationEmailSent'));
    } else {
      showToast(
        result.error || t('account.toastVerificationEmailFailed'),
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
      showToast(t('account.toastEmailUpdated'));
      setEmailMode('view');
      setNewEmail('');
      setEmailPassword('');
    } else {
      showToast(result.error || t('account.toastEmailUpdateFailed'), 'error');
    }
  };

  const handleSetDefaultAddress = (id) => {
    setDefaultAddress(uid, id);
    showToast(t('account.toastDefaultAddressUpdated'));
  };

  return (
    <div className="dash-section">
      <SectionTitle
        title={t('account.navProfile')}
        subtitle={t('account.profileSubtitle')}
      />

      <div className="dash-card dash-profile-layout">
        <div className="dash-profile-photo">
          <ProfileImageUploader
            photoURL={signedPhotoURL || normalized.photoURL}
            onSave={handleSavePhoto}
            onRemove={handleRemovePhoto}
          />
          {photoError && (
            <p className="dash-field-error">{photoError}</p>
          )}
          {photoSaving && (
            <p className="dash-form-note">
              <FontAwesomeIcon icon={faSpinner} spin /> {t('account.uploading')}
            </p>
          )}
        </div>

        <form onSubmit={handleSaveProfile} className="dash-form">
          <div className="dash-field">
            <label htmlFor="profile-name">{t('account.fullName')}</label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <div className="dash-field">
            <label htmlFor="profile-phone">{t('account.phoneNumber')}</label>
            <div className="dash-phone-summary">
              <p id="profile-phone">{normalized.phone}</p>
              {normalized.phoneVerified ? (
                <span className="dash-verify-badge verified">
                  <FontAwesomeIcon icon={faCheckCircle} /> {t('account.verified')}
                </span>
              ) : (
                <Link
                  to="/account/security"
                  className="dash-inline-verify"
                >
                  <FontAwesomeIcon icon={faTriangleExclamation} />{' '}
                  {t('account.verifyPhoneForUpdates')}
                </Link>
              )}
            </div>
            <p className="dash-form-note">
              {t('account.phoneVerificationUnderSecurity')}
            </p>
          </div>

          <div className="dash-field">
            <label>{t('account.defaultAddress')}</label>
            {addresses.length === 0 ? (
              <p className="dash-field-error">
                {t('account.noSavedAddressesYet')}{' '}
                <Link to="/account/addresses">{t('account.addAnAddress')}</Link>{' '}
                {t('account.forFasterCheckout')}
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
                <FontAwesomeIcon icon={faSpinner} spin /> {t('account.saving')}
              </>
            ) : (
              t('account.saveChanges')
            )}
          </button>
        </form>
      </div>

      <div className="dash-card dash-email-card">
        <div className="dash-card-head">
          <h3>
            <FontAwesomeIcon icon={faEnvelope} /> {t('account.emailTitle')}
          </h3>
        </div>
        <div className="dash-email-row">
          <div>
            <p className="dash-email-address">{normalized.email}</p>
            {normalized.emailVerified ? (
              <span className="dash-verify-badge verified">
                <FontAwesomeIcon icon={faCheckCircle} />{' '}
                {t('account.emailVerified')}
              </span>
            ) : (
              <span className="dash-verify-badge unverified">
                <FontAwesomeIcon icon={faTriangleExclamation} />{' '}
                {t('account.emailNotVerified')}
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
                {verifyBusy ? t('account.sending') : t('account.verifyEmail')}
              </button>
            )}
            <button
              type="button"
              className="menu-btn dash-btn-sm"
              onClick={() => setEmailMode(emailMode === 'view' ? 'change' : 'view')}
            >
              {emailMode === 'view'
                ? t('account.changeEmail')
                : t('common.actions.cancel')}
            </button>
          </div>
        </div>

        {emailMode === 'change' && (
          <form onSubmit={handleChangeEmail} className="dash-form dash-email-change">
            <p className="dash-form-note">
              <FontAwesomeIcon icon={faKey} /> {t('account.emailChangeNote')}
            </p>
            <div className="dash-field">
              <label htmlFor="new-email">{t('account.newEmail')}</label>
              <input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                required
              />
            </div>
            <div className="dash-field">
              <label htmlFor="email-password">
                {t('account.currentPassword')}
              </label>
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
                  <FontAwesomeIcon icon={faSpinner} spin /> {t('account.updating')}
                </>
              ) : (
                t('account.updateEmail')
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;
