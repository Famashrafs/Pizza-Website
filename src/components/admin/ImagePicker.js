import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faImage,
  faUpload,
  faLink,
  faTrash,
  faSpinner,
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons';
import {
  createPreviewUrl,
  isImageStorageConfigured,
  revokePreviewUrl,
  uploadImage,
  validateImageFile,
} from '../../services/imageService';

// Image field used by the product form and restaurant settings. Supports a
// pasted URL (always available) and a real file upload when Firebase Storage is
// configured. Shows preview, upload progress, success and error states, and
// never pretends an unconfigured upload succeeded.
function ImagePicker({
  value,
  onChange,
  label = 'Image',
  path = 'menu',
  disabled = false,
  aspect = 'square',
}) {
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const inputRef = useRef(null);
  const configured = isImageStorageConfigured();

  useEffect(() => {
    return () => revokePreviewUrl(preview);
  }, [preview]);

  const display = preview || value || '';

  const clearTimers = () => {
    setError('');
    setSuccess('');
  };

  const handleFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (event.target) event.target.value = '';
    if (!file) return;

    clearTimers();
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    const localPreview = createPreviewUrl(file);
    setPreview(localPreview);

    if (!configured) {
      setError(
        'File uploads require Firebase Storage. Paste an image URL, or configure REACT_APP_FIREBASE_STORAGE_BUCKET.'
      );
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const url = await uploadImage(file, { path, onProgress: setProgress });
      onChange(url);
      setPreview('');
      revokePreviewUrl(localPreview);
      setSuccess('Image uploaded.');
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    clearTimers();
    revokePreviewUrl(preview);
    setPreview('');
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleUrlChange = (url) => {
    clearTimers();
    revokePreviewUrl(preview);
    setPreview('');
    onChange(url);
  };

  return (
    <div className="image-picker">
      <span className="image-picker-label">{label}</span>
      <div className="image-picker-row">
        <div className={`image-picker-preview is-${aspect}`}>
          {display ? (
            <img src={display} alt="" />
          ) : (
            <span className="image-picker-placeholder">
              <FontAwesomeIcon icon={faImage} />
            </span>
          )}
        </div>

        <div className="image-picker-controls">
          <div className="image-picker-actions">
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => inputRef.current && inputRef.current.click()}
              disabled={disabled || uploading}
            >
              <FontAwesomeIcon icon={faUpload} />
              {uploading ? 'Uploading…' : display ? 'Replace' : 'Upload'}
            </button>
            {display && (
              <button
                type="button"
                className="admin-btn admin-btn--danger-ghost"
                onClick={handleRemove}
                disabled={disabled || uploading}
              >
                <FontAwesomeIcon icon={faTrash} /> Remove
              </button>
            )}
          </div>

          <label className="image-picker-url">
            <FontAwesomeIcon icon={faLink} />
            <input
              type="url"
              inputMode="url"
              placeholder="Paste an image URL"
              value={preview ? '' : value || ''}
              onChange={(event) => handleUrlChange(event.target.value)}
              disabled={disabled || uploading}
            />
          </label>

          {uploading && (
            <div className="image-picker-progress" role="progressbar" aria-valuenow={progress}>
              <span style={{ width: `${progress}%` }} />
            </div>
          )}
          {!uploading && success && (
            <p className="image-picker-success">
              <FontAwesomeIcon icon={faCircleCheck} /> {success}
            </p>
          )}
          {!uploading && error && <p className="image-picker-error">{error}</p>}
          {!configured && !error && (
            <p className="image-picker-hint">
              File uploads need Firebase Storage; pasted URLs always work.
            </p>
          )}
          {uploading && (
            <p className="image-picker-hint">
              <FontAwesomeIcon icon={faSpinner} spin /> {progress}%
            </p>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="image-picker-input"
        onChange={handleFile}
        disabled={disabled || uploading}
        hidden
      />
    </div>
  );
}

export default ImagePicker;
