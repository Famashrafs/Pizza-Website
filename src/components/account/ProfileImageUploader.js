import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faSpinner,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const MAX_DIMENSION = 320;

// Internal marker for a failed file read. The message shown to the user is
// translated at the catch site.
const FILE_READ_ERROR = 'file-read-error';

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(FILE_READ_ERROR));
    reader.readAsDataURL(file);
  });
}

// Downscales so the stored preview stays small (it is persisted locally).
function downscale(fallbackUrl) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => {
        // Fall back to the raw data URL if the browser cannot re-encode it.
        resolve(fallbackUrl);
      };
      img.src = fallbackUrl;
    } catch (err) {
      resolve(fallbackUrl);
    }
  });
}

function ProfileImageUploader({ photoURL, onSave, onRemove }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | editing | uploading
  const [preview, setPreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const reset = () => {
    setPhase('idle');
    setPreview('');
    setUploadProgress(0);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(t('account.errorImageType'));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(t('account.errorImageSize'));
      return;
    }
    try {
      const raw = await readAsDataUrl(file);
      setPreview(raw);
      setPhase('editing');
    } catch (err) {
      setError(
        err.message === FILE_READ_ERROR
          ? t('account.errorReadFile')
          : t('account.errorLoadImage')
      );
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    setPhase('uploading');
    setError('');
    // Progress is reported while the browser processes the image.
    const timer = window.setInterval(() => {
      setUploadProgress((p) => Math.min(96, p + 12));
    }, 90);
    try {
      const optimized = await downscale(preview);
      onSave(optimized);
      window.clearInterval(timer);
      setUploadProgress(100);
      reset();
    } catch (err) {
      window.clearInterval(timer);
      setError(t('account.errorSaveImage'));
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
              onClick={() => {
                onRemove();
                reset();
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
