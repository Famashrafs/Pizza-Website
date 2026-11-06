import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
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
  validateImageFile,
} from '../../services/imageService';

// Image field used by the product form and restaurant settings. The browser
// file is selected here, but the actual Storage upload is performed by the
// form's Save action. Deferring the upload prevents a cancelled form from
// leaving an orphaned object in Storage.
//
// Pasted URLs remain supported. When Storage is unavailable they are still a
// valid way to reference an existing image.
function ImagePicker({
  value,
  onChange,
  onFileSelect,
  selectedFile = null,
  label,
  disabled = false,
  aspect = 'square',
  uploading = false,
  progress = 0,
  error = '',
  success = '',
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState('');
  const inputRef = useRef(null);
  const configured = isImageStorageConfigured();

  useEffect(() => {
    const localPreview = selectedFile ? createPreviewUrl(selectedFile) : '';
    setPreview(localPreview);
    return () => revokePreviewUrl(localPreview);
  }, [selectedFile]);

  const display = preview || value || '';

  const handleFile = (event) => {
    const file = event.target.files && event.target.files[0];
    if (event.target) event.target.value = '';
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      onFileSelect?.(null, validation.error);
      return;
    }
    if (!configured) {
      onFileSelect?.(null, t('admin.imageStorageNotConfigured'));
      return;
    }

    onFileSelect?.(file, '');
  };

  const handleRemove = () => {
    onChange('');
    onFileSelect?.(null, '');
  };

  const handleUrlChange = (url) => {
    onChange(url);
    onFileSelect?.(null, '');
  };

  return (
    <div className="image-picker">
      <span className="image-picker-label">{label || t('admin.imageFieldLabel')}</span>
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
              {uploading
                ? t('admin.uploading')
                : display
                ? t('admin.replace')
                : t('admin.upload')}
            </button>
            {display && (
              <button
                type="button"
                className="admin-btn admin-btn--danger-ghost"
                onClick={handleRemove}
                disabled={disabled || uploading}
              >
                <FontAwesomeIcon icon={faTrash} /> {t('common.actions.remove')}
              </button>
            )}
          </div>

          <label className="image-picker-url">
            <FontAwesomeIcon icon={faLink} />
            <input
              type="url"
              inputMode="url"
              placeholder={t('admin.pasteImageUrl')}
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
              {t('admin.imageStorageHint')}
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
