import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const label =
    score <= 2 ? 'Weak' : score === 3 ? 'Fair' : score === 4 ? 'Good' : 'Strong';
  const color =
    score <= 2 ? 'weak' : score === 3 ? 'fair' : score === 4 ? 'good' : 'strong';
  return { score: Math.min(4, score), label, color };
}

function PasswordChangeForm() {
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
    if (!current) errors.current = 'Current password is required.';
    if (!next) errors.next = 'New password is required.';
    else if (!meetsMinimums)
      errors.next =
        'New password must be at least 6 characters and include a letter and a number.';
    if (next !== confirm) errors.confirm = 'Passwords do not match.';
    if (next && next === current)
      errors.next = 'New password must be different from the current password.';
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
      showToast('Your password has been changed successfully.');
      setMessage(
        'Password updated. You may need to sign in again on other devices.'
      );
    } else {
      setMessage(result.error || 'We could not change your password.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="dash-form dash-password">
      <div className="dash-field">
        <label htmlFor="current-password">Current Password</label>
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
            aria-label={show ? 'Hide passwords' : 'Show passwords'}
          >
            <FontAwesomeIcon icon={show ? faEyeSlash : faEye} />
          </button>
        </div>
        {fieldErrors.current && (
          <p className="dash-field-error">{fieldErrors.current}</p>
        )}
      </div>

      <div className="dash-field">
        <label htmlFor="new-password">New Password</label>
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
            <span className="dash-strength-label">{strength.label}</span>
          </div>
        )}
        <ul className="dash-password-reqs">
          <li className={next.length >= 6 ? 'met' : ''}>
            At least 6 characters
          </li>
          <li className={/[A-Za-z]/.test(next) ? 'met' : ''}>
            Contains a letter
          </li>
          <li className={/\d/.test(next) ? 'met' : ''}>Contains a number</li>
        </ul>
        {fieldErrors.next && (
          <p className="dash-field-error">{fieldErrors.next}</p>
        )}
      </div>

      <div className="dash-field">
        <label htmlFor="confirm-password">Confirm New Password</label>
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
            <FontAwesomeIcon icon={faSpinner} spin /> Updating password…
          </>
        ) : (
          'Change Password'
        )}
      </button>
      {message && <p className="dash-form-message">{message}</p>}
      <p className="dash-form-note">
        For security, you will be asked to confirm your identity before the
        password is changed.
      </p>
    </form>
  );
}

export default PasswordChangeForm;