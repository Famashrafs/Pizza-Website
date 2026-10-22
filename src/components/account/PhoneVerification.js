import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSpinner,
  faCheckCircle,
  faPhone,
  faRotateRight,
  faPen,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  sendPhoneVerificationCode,
  confirmPhoneVerificationCode,
  normalizeE164,
  maskPhone,
  OTP_LENGTH,
  RESEND_SECONDS,
} from '../../services/phoneAuth';

function PhoneVerification({ account, onVerified }) {
  const { t } = useTranslation();
  const { updateProfileData } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState(
    account?.phone && account?.phoneVerified ? 'verified' : 'enter'
  );
  const [phone, setPhone] = useState(account?.phone || '');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);

  const confirmationRef = useRef(null);
  const countdownRef = useRef(null);

  const isVerified = account?.phoneVerified;
  const displayedPhone = account?.phone;

  useEffect(() => {
    if (isVerified) setMode('verified');
  }, [isVerified]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) window.clearInterval(countdownRef.current);
    };
  }, []);

  const startCountdown = () => {
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    setCountdown(RESEND_SECONDS);
    countdownRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSend = async (event) => {
    event?.preventDefault();
    setError('');
    setExpired(false);
    if (!phone.trim()) {
      setError(t('account.errorEnterPhone'));
      return;
    }
    setSending(true);
    try {
      const confirmation = await sendPhoneVerificationCode(phone);
      confirmationRef.current = confirmation;
      setCode('');
      setAttempts(0);
      setMode('confirm');
      startCountdown();
      showToast(t('account.toastCodeSent'));
    } catch (err) {
      setError(err.message || t('account.toastSendCodeFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = async (event) => {
    event?.preventDefault();
    if (!code || code.length !== OTP_LENGTH) {
      setError(t('account.errorEnterCode', { length: OTP_LENGTH }));
      return;
    }
    if (!confirmationRef.current) {
      setError(t('account.errorRequestNewCode'));
      return;
    }
    setConfirming(true);
    setError('');
    try {
      const user = await confirmPhoneVerificationCode(
        confirmationRef.current,
        code
      );
      confirmationRef.current = null;
      await updateProfileData({
        phone: user.phoneNumber || normalizeE164(phone),
        phoneVerified: true,
      });
      setMode('verified');
      onVerified?.();
      showToast(t('account.toastPhoneVerified'));
    } catch (err) {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      if (err.code === 'auth/code-expired') {
        setExpired(true);
        setError(t('account.errorCodeExpired'));
      } else if (nextAttempts >= 5) {
        confirmationRef.current = null;
        setMode('enter');
        setError(t('account.errorTooManyAttempts'));
      } else {
        setError(err.message || t('account.errorCodeIncorrect'));
      }
    } finally {
      setConfirming(false);
    }
  };

  const handleResend = () => {
    if (countdown > 0) return;
    handleSend();
  };

  const handleChangePhone = () => {
    confirmationRef.current = null;
    setMode('enter');
    setError('');
  };

  const maskedInput = maskPhone(phone);

  return (
    <div className="dash-phone">
      <div
        id="phone-recaptcha-container"
        style={{ position: 'fixed', width: 0, height: 0, overflow: 'hidden' }}
      />

      {mode === 'verified' && displayedPhone ? (
        <div className="dash-phone-status verified">
          <FontAwesomeIcon icon={faCheckCircle} />
          <div>
            <p className="dash-phone-value">
              <FontAwesomeIcon icon={faPhone} /> {displayedPhone}
            </p>
            <p className="dash-phone-verified">{t('account.verified')}</p>
          </div>
          <button
            type="button"
            className="menu-btn dash-btn-sm"
            onClick={handleChangePhone}
          >
            <FontAwesomeIcon icon={faPen} /> {t('account.change')}
          </button>
        </div>
      ) : (
        <div className="dash-phone-form">
          {mode === 'enter' ? (
            <form onSubmit={handleSend} className="dash-phone-enter">
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={t('account.phonePlaceholder')}
                autoComplete="tel"
              />
              <button
                type="submit"
                className="contact-btn dash-btn-sm"
                disabled={sending}
              >
                {sending ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin /> {t('account.sending')}
                  </>
                ) : (
                  t('account.sendVerificationCode')
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirm} className="dash-phone-confirm">
              <p>
                {t('account.codeSentToPrefix', { length: OTP_LENGTH })}{' '}
                <strong>{maskedInput}</strong>
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={OTP_LENGTH}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/[^\d]/g, ''))
                }
                placeholder={t('account.codePlaceholder')}
                autoFocus
                aria-label={t('account.verificationCodeAria')}
              />
              <div className="dash-phone-actions">
                <button
                  type="submit"
                  className="contact-btn dash-btn-sm"
                  disabled={confirming || code.length !== OTP_LENGTH}
                >
                  {confirming ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin /> {t('account.verifying')}
                    </>
                  ) : (
                    t('account.verify')
                  )}
                </button>
                <button
                  type="button"
                  className="menu-btn dash-btn-sm"
                  onClick={handleChangePhone}
                  disabled={confirming}
                >
                  {t('account.changePhone')}
                </button>
              </div>
              <div className="dash-phone-resend">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={countdown > 0 || sending}
                >
                  <FontAwesomeIcon icon={faRotateRight} />
                  {countdown > 0
                    ? t('account.resendIn', { seconds: countdown })
                    : sending
                    ? t('account.sending')
                    : t('account.resendCode')}
                </button>
              </div>
            </form>
          )}
          {error && <p className="dash-field-error">{error}</p>}
          {expired && (
            <p className="dash-field-error">{t('account.requestNewCode')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default PhoneVerification;
