// Firebase Admin initialization for the demo API.
//
// Credentials NEVER live in the repository. The service account is supplied at
// runtime through the `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable (the
// full service-account JSON as a single string) — configured in the Render
// dashboard and in a local, git-ignored `server/.env`.
//
// Security notes:
//   - `verifyIdToken(token, true)` also checks revocation.
//   - Anonymous (guest) Firebase sessions verify exactly like registered ones;
//     the identity provider (`anonymous` vs `password`) is read from the decoded
//     token, never from the client.

'use strict';

function parseServiceAccount(raw) {
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is required (paste the service-account JSON as a single-line string).'
    );
  }
  let account;
  try {
    account = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
  if (!account.project_id || !account.private_key || !account.client_email) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON must contain project_id, client_email and private_key.'
    );
  }
  return account;
}

/**
 * Initialize the Admin SDK from the environment.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ app: object, db: object, projectId: string, verifyToken: Function, serverTimestamp: Function }}
 */
function initFirebaseAdmin(env = process.env) {
  const { initializeApp, cert, getApps } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  const { getAuth } = require('firebase-admin/auth');

  const credentials = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const projectId = env.FIREBASE_PROJECT_ID || credentials.project_id;

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(credentials), projectId });

  const db = getFirestore(app);
  const auth = getAuth(app);

  return {
    app,
    db,
    projectId,
    // checkRevoked = true so a disabled/deleted user or revoked token is
    // rejected even while the JWT would otherwise still be valid.
    verifyToken: (idToken) => auth.verifyIdToken(idToken, true),
    serverTimestamp: () => FieldValue.serverTimestamp(),
  };
}

module.exports = { initFirebaseAdmin, parseServiceAccount };
