import i18n from '../i18n';

// Maps a Firebase / Firestore error CODE to the translation key of the
// message shown to the user.
//
// The CODES are a contract: they come from Firebase (and from the Firestore
// data layer) and must never change. Only the message side is translated —
// the lookup happens through the i18next singleton so the returned string
// always matches the language that is currently active.
//
// `getAuthErrorMessage` keeps its name and signature: callers depend on it.
const FIREBASE_ERROR_KEYS = {
  'auth/email-already-in-use': 'auth.errorEmailInUse',
  'auth/user-not-found': 'auth.errorUserNotFound',
  'auth/wrong-password': 'auth.errorWrongPassword',
  'auth/invalid-credential': 'auth.errorInvalidCredential',
  'auth/invalid-email': 'auth.errorInvalidEmail',
  'auth/weak-password': 'auth.errorWeakPassword',
  'auth/popup-closed-by-user': 'auth.errorPopupClosedByUser',
  'auth/cancelled-popup-request': 'auth.errorCancelledPopupRequest',
  'auth/too-many-requests': 'auth.errorTooManyRequests',
  'auth/network-request-failed': 'auth.errorNetworkRequestFailed',
  'auth/user-disabled': 'auth.errorUserDisabled',
  'auth/missing-email': 'auth.errorMissingEmail',
  'auth/requires-recent-login': 'auth.errorRequiresRecentLogin',
  'auth/invalid-verification-code': 'auth.errorInvalidVerificationCode',
  'auth/missing-verification-code': 'auth.errorMissingVerificationCode',
  'auth/code-expired': 'auth.errorCodeExpired',
  'auth/quota-exceeded': 'auth.errorQuotaExceeded',
  'auth/captcha-check-failed': 'auth.errorCaptchaCheckFailed',
  'auth/operation-not-allowed': 'auth.errorOperationNotAllowed',
  'auth/invalid-phone-number': 'auth.errorInvalidPhoneNumber',
  'auth/credential-already-in-use': 'auth.errorCredentialAlreadyInUse',
  'auth/account-exists-with-different-credential':
    'auth.errorAccountExistsWithDifferentCredential',
  'auth/invalid-app-credential': 'auth.errorInvalidAppCredential',
  'auth/missing-or-invalid-nonce': 'auth.errorMissingOrInvalidNonce',
  'restaurant/already-owned': 'auth.errorRestaurantAlreadyOwned',
  // Data-layer failures (Firestore) used to fall through to the generic message
  // below, which made an unreachable database indistinguishable from a typo.
  unavailable: 'auth.errorUnavailable',
  'permission-denied': 'auth.errorPermissionDenied',
  'failed-precondition': 'auth.errorFailedPrecondition',
  'deadline-exceeded': 'auth.errorDeadlineExceeded',
};

export default function getAuthErrorMessage(code) {
  const key = FIREBASE_ERROR_KEYS[code];
  return key ? i18n.t(key) : i18n.t('common.errors.generic');
}
