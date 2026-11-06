import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faSpinner,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { createPreviewUrl, revokePreviewUrl } from '../../services/imageService';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB

function ProfileImageUploader({ photoURL, onSave, onRemove }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | editing | uploading
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const localPreview = file ? createPreviewUrl(file) : '';
    setPreview(localPreview);
    return () => revokePreviewUrl(localPreview);
  }, [file]);

  const reset = () => {
    setPhase('idle');
    setFile(null);
    setUploadProgress(0);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleSelect = (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setError('');
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError(t('account.errorImageType'));
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError(t('account.errorImageSize'));
      return;
    }
    setFile(selected);
    setPhase('editing');
  };

  const handleSave = async () => {
    if (!file || phase === 'uploading') return;
    setPhase('uploading');
    setError('');
    setUploadProgress(0);
    try {
      await onSave(file, { onProgress: setUploadProgress });
      setUploadProgress(100);
      reset();
    } catch (err) {
      setError(err.message || t('account.errorSaveImage'));
      setPhase('editing');
    }
  };

  return (
    <div className="dash-uploader">
      <div className="dash-uploader-preview">
        {preview ? (
          <img src={preview} alt={t('account.profilePreviewAlt')} />
        ) : photoURL ? (
          <img src={photoURL} alt={t('account.profileAlt')} />
        ) : (
          <span className="dash-uploader-none">
            <FontAwesomeIcon icon={faCamera} />
          </span>
        )}
        {phase === 'uploading' && (
          <span className="dash-uploader-progress">
            <FontAwesomeIcon icon={faSpinner} spin /> {uploadProgress}%
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleSelect}
        style={{ display: 'none' }}
        aria-label={t('account.chooseProfilePictureAria')}
      />

      {phase === 'editing' ? (
        <div className="dash-uploader-actions">
          <button
            type="button"
            className="contact-btn dash-btn-sm"
            onClick={handleSave}
            disabled={phase === 'uploading'}
          >
            {phase === 'uploading' ? t('account.saving') : t('account.savePhoto')}
          </button>
          <button
            type="button"
            className="menu-btn dash-btn-sm"
            onClick={reset}
            disabled={phase === 'uploading'}
          >
            <FontAwesomeIcon icon={faXmark} /> {t('common.actions.cancel')}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="menu-btn dash-btn-sm"
            onClick={() => inputRef.current?.click()}
          >
            <FontAwesomeIcon icon={faCamera} /> {t('account.changeProfilePicture')}
          </button>
          {photoURL && (
            <button
              type="button"
              className="menu-btn dash-btn-sm is-danger"
              onClick={async () => {
                try {
                  await onRemove();
                  reset();
                } catch (err) {
                  setError(err.message || t('account.errorSaveImage'));
                }
              }}
            >
              <FontAwesomeIcon icon={faTrash} /> {t('account.removeProfilePicture')}
            </button>
          )}
        </>
      )}

      {error && <p className="dash-field-error">{error}</p>}
      <p className="dash-uploader-note">{t('account.uploaderNote')}</p>
    </div>
  );
}

export default ProfileImageUploader;
