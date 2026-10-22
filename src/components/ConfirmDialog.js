import React, { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation();
  const confirmRef = useRef(null);
  const previouslyFocused = useRef(null);
  const dialogTitle = title || t('common.a11y.confirmTitle');
  const confirmText = confirmLabel || t('common.actions.confirm');
  const cancelText = cancelLabel || t('common.actions.cancel');

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (confirmRef.current) confirmRef.current.focus();

    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused.current?.focus) previouslyFocused.current.focus();
    };
  }, [onCancel]);

  return (
    <div
      className="modal-overlay confirm-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? 'confirm-message' : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <FontAwesomeIcon
          icon={faTriangleExclamation}
          className={`confirm-icon ${danger ? 'danger' : ''}`}
        />
        <h3 id="confirm-title">{dialogTitle}</h3>
        {message && <p id="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`confirm-confirm ${danger ? 'danger' : ''}`}
            onClick={onConfirm}
            ref={confirmRef}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
