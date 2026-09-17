import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faSpinner,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const MAX_DIMENSION = 320;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
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
      setError('Please choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('That image is larger than 4 MB. Please choose a smaller one.');
      return;
    }
    try {
      const raw = await readAsDataUrl(file);
      setPreview(raw);
      setPhase('editing');
    } catch (err) {
      setError(err.message || 'Unable to load the selected image.');
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
      setError(err.message || 'We could not save the image. Please try again.');
      setPhase('editing');
    }
  };

  return (
    <div className="dash-uploader">
      <div className="dash-uploader-preview">
        {preview ? (
          <img src={preview} alt="Profile preview" />
        ) : photoURL ? (
          <img src={photoURL} alt="Profile" />
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
        aria-label="Choose a profile picture"
      />

      {phase === 'editing' ? (
        <div className="dash-uploader-actions">
          <button
            type="button"
            className="contact-btn dash-btn-sm"
            onClick={handleSave}
            disabled={phase === 'uploading'}
          >
            {phase === 'uploading' ? 'Saving…' : 'Save Photo'}
          </button>
          <button
            type="button"
            className="menu-btn dash-btn-sm"
            onClick={reset}
            disabled={phase === 'uploading'}
          >
            <FontAwesomeIcon icon={faXmark} /> Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="menu-btn dash-btn-sm"
            onClick={() => inputRef.current?.click()}
          >
            <FontAwesomeIcon icon={faCamera} /> Change Profile Picture
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
              <FontAwesomeIcon icon={faTrash} /> Remove Profile Picture
            </button>
          )}
        </>
      )}

      {error && <p className="dash-field-error">{error}</p>}
      <p className="dash-uploader-note">
        JPG, PNG or WebP up to 4 MB. Your picture is stored locally with your
        account and shown when you return.
      </p>
    </div>
  );
}

export default ProfileImageUploader;