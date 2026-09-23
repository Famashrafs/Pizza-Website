const FIREBASE_ERRORS = {
  'auth/email-already-in-use': 'An account already exists with this email.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled before it finished.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your connection.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/missing-email': 'Please enter your email address.',
  'auth/requires-recent-login':
    'This action requires a recent sign-in. Please sign in again first.',
  'auth/invalid-verification-code':
    'The verification code is incorrect. Please check it and try again.',
  'auth/missing-verification-code': 'Please enter the 6-digit verification code.',
  'auth/code-expired':
    'This verification code has expired. Please request a new one.',
  'auth/quota-exceeded':
    'Too many verification attempts. Please try again later.',
  'auth/captcha-check-failed':
    'Unable to verify that you are not a robot. Please try again.',
  'auth/operation-not-allowed':
    'This sign-in method is not enabled for this project yet.',
  'auth/invalid-phone-number': 'Please enter a valid phone number.',
  'auth/credential-already-in-use':
    'This credential is already linked to another account.',
  'auth/account-exists-with-different-credential':
    'An account already exists with the same email but a different sign-in method.',
  'auth/invalid-app-credential':
    'Verification could not be completed. Please check your Firebase configuration.',
  'auth/missing-or-invalid-nonce':
    'Security verification failed. Please refresh the page and try again.',
  'restaurant/already-owned':
    'This storefront already has an owner. Only the active owner can manage this deployment.',
};

export default function getAuthErrorMessage(code) {
  return (
    FIREBASE_ERRORS[code] ||
    'Something went wrong. Please try again.'
  );
}