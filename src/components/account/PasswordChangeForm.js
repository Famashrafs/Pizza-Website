import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// The strength score drives the styling; `label` holds the translation key of
// the human-readable strength so it can be localized.
export function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const label =
    score <= 2
      ? 'account.strengthWeak'
      : score === 3
      ? 'account.strengthFair'
      : score === 4
      ? 'account.strengthGood'
      : 'account.strengthStrong';
  const color =
    score <= 2 ? 'weak' : score === 3 ? 'fair' : score === 4 ? 'good' : 'strong';
  return { score: Math.min(4, score), label, color };
}

function PasswordChangeForm() {
  const { t } = useTranslation();
  const { changePassword } = useAuth();
  const { showToast } = useToast();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const strength = getPasswordStrength(next);
  const meetsMinimums =
    next.length >= 6 && /[A-Za-z]/.test(next) && /\d/.test(next);

  const validate = () => {
    const errors = {};
    if (!current) errors.current = t('account.errorCurrentPasswordRequired');
    if (!next) errors.next = t('account.errorNewPasswordRequired');
    else if (!meetsMinimums)
      errors.next = t('account.errorNewPasswordRules');
    if (next !== confirm) errors.confirm = t('account.errorPasswordsDoNotMatch');
    if (next && next === current)
      errors.next = t('account.errorNewPasswordSame');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    if (!validate()) return;
    setBusy(true);
    const result = await changePassword(current, next);
    setBusy(false);
    if (result.success) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setFieldErrors({});
      showToast(t('account.toastPasswordChanged'));
      setMessage(t('account.passwordUpdatedNote'));
    } else {
      setMessage(result.error || t('account.toastPasswordChangeFailed'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="dash-form dash-password">
      <div className="dash-field">
        <label htmlFor="current-password">
          {t('account.currentPasswordLabel')}
        </label>
        <div className="dash-password-input">
          <input
            id="current-password"
            type={show ? 'text' : 'password'}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            className="dash-password-toggle"
            onClick={() => setShow(!show)}
            aria-label={show ? t('account.hidePasswords') : t('account.showPasswords')}
          >
            <FontAwesomeIcon icon={show ? faEyeSlash : faEye} />
          </button>
        </div>
        {fieldErrors.current && (
          <p className="dash-field-error">{fieldErrors.current}</p>
        )}
      </div>

      <div className="dash-field">
        <label htmlFor="new-password">{t('account.newPasswordLabel')}</label>
        <div className="dash-password-input">
          <input
            id="new-password"
            type={show ? 'text' : 'password'}
            value={next}
            onChange={(event) => setNext(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        {next && (
          <div className="dash-strength">
            <span className={`dash-strength-bar is-${strength.color}`} />
            <span className="dash-strength-label">{t(strength.label)}</span>
          </div>
        )}
        <ul className="dash-password-reqs">
          <li className={next.length >= 6 ? 'met' : ''}>
            {t('account.reqMinLength')}
          </li>
          <li className={/[A-Za-z]/.test(next) ? 'met' : ''}>
            {t('account.reqLetter')}
          </li>
          <li className={/\d/.test(next) ? 'met' : ''}>{t('account.reqNumber')}</li>
        </ul>
        {fieldErrors.next && (
          <p className="dash-field-error">{fieldErrors.next}</p>
        )}
      </div>

      <div className="dash-field">
        <label htmlFor="confirm-password">
          {t('account.confirmNewPasswordLabel')}
        </label>
        <div className="dash-password-input">
          <input
            id="confirm-password"
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        {fieldErrors.confirm && (
          <p className="dash-field-error">{fieldErrors.confirm}</p>
        )}
      </div>

      <button
        type="submit"
        className="contact-btn dash-btn-sm"
        disabled={busy}
      >
        {busy ? (
          <>
            <FontAwesomeIcon icon={faSpinner} spin /> {t('account.updatingPassword')}
          </>
        ) : (
          t('account.changePasswordButton')
        )}
      </button>
      {message && <p className="dash-form-message">{message}</p>}
      <p className="dash-form-note">{t('account.passwordSecurityNote')}</p>
    </form>
  );
}

export default PasswordChangeForm;
