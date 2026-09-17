// Phone number verification through Firebase Auth. Web sign-in requires a
// reCAPTCHA verifier, so the caller must render a hidden container element
// (id: "phone-recaptcha-container") once per mounted view. The confirmation
// result returned by the provider is the ONLY way a code is checked — the OTP
// is never stored in the frontend.

import {
  RecaptchaVerifier,
  linkWithPhoneNumber,
} from 'firebase/auth';
import { auth } from '../firebase';
import getAuthErrorMessage from './authErrors';

export const RESEND_SECONDS = 60;
export const OTP_LENGTH = 6;

export function normalizeE164(input) {
  const cleaned = String(input || '').replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  return `+${cleaned}`;
}

export function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 7) return phone || '';
  const tail = digits.slice(-4);
  const prefix = digits.length > 10 ? `+${digits.slice(0, 2)}` : '+';
  return `${prefix}******${tail}`;
}

function makeVerifier() {
  // Detects whether the project has the Phone provider enabled.
  const verifier = new RecaptchaVerifier(auth, 'phone-recaptcha-container', {
    size: 'invisible',
  });
  return verifier;
}

function toError(err) {
  const message = getAuthErrorMessage(err?.code);
  const enhanced = new Error(message);
  enhanced.code = err?.code || 'auth/unknown';
  enhanced.original = err;
  return enhanced;
}

// Sends an SMS code to the signed-in user's phone and links the phone as a
// verification provider. Requires the JS SDK + reCAPTCHA environment.
export async function sendPhoneVerificationCode(phoneNumber) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to verify a phone number.');

  let verifier;
  try {
    verifier = makeVerifier();
    await verifier.render();
    const confirmationResult = await linkWithPhoneNumber(
      user,
      normalizeE164(phoneNumber),
      verifier
    );
    return confirmationResult;
  } catch (err) {
    if (verifier) {
      try {
        verifier.clear();
      } catch (clearErr) {
        /* ignore */
      }
    }
    throw toError(err);
  }
}

export async function confirmPhoneVerificationCode(confirmationResult, code) {
  try {
    const credential = await confirmationResult.confirm(code);
    return credential.user;
  } catch (err) {
    throw toError(err);
  }
}

export function isRecaptchaRequired() {
  return typeof window !== 'undefined';
}

const phoneAuth = {
  sendPhoneVerificationCode,
  confirmPhoneVerificationCode,
  normalizeE164,
  maskPhone,
  OTP_LENGTH,
  RESEND_SECONDS,
  isRecaptchaRequired,
};

export default phoneAuth;