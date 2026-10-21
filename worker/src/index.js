// Cloudflare Worker entry point (Phase 2.5 demo backend).
//
//   Local:  npm --prefix worker install && npm --prefix worker run dev
//   Deploy: npm --prefix worker run deploy   (wrangler deploy)
//
// Wires the SHARED order engine (functions/lib/orderServiceCore.js — the same
// engine behind the Firebase callables and the Render/Express API) to the
// Worker transport (./app.js). Order logic is NOT reimplemented here.
//
// Firebase Admin SDK cannot run on Workers, so:
//   - ID tokens are verified against Google's Secure Token JWKS with full
//     signature/claim checks plus revocation lookup (./firebaseAuth.js),
//   - Firestore is accessed through its REST API with OAuth2 service-account
//     credentials, preserving transactions (./firestore.js).
//
// Configuration (wrangler.toml [vars] + `wrangler secret put`):
//   FIREBASE_SERVICE_ACCOUNT_JSON  (secret) service-account JSON, one line
//   FIREBASE_PROJECT_ID             public project id
//   FIREBASE_WEB_API_KEY            public web API key (revocation lookup)
//   CORS_ALLOWED_ORIGINS            comma-separated browser origin allowlist
//   DEMO_MODE                       "demo" (default) or "live"
//   FIRESTORE_EMULATOR_HOST         local emulator only (wrangler dev)

import { createWorkerApp } from './app.js';
import { createOrderService } from '../../functions/lib/orderServiceCore.js';
import { createVerifyIdToken } from './firebaseAuth.js';
import { createFirestore, serverTimestamp } from './firestore.js';
import { parseServiceAccount, createAccessTokenProvider } from './serviceAccount.js';

// Per-isolate cache: services are built once per isolate (env never changes
// within a Worker version). Nothing secret is captured beyond the env itself.
let cachedHandler = null;

function buildHandler(env) {
  const projectId = env.FIREBASE_PROJECT_ID || null;
  const account = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);

  const getAccessToken = createAccessTokenProvider({ account });
  const db = createFirestore({
    projectId: projectId || account.project_id,
    getAccessToken,
    emulatorHost: env.FIRESTORE_EMULATOR_HOST || null,
  });

  const verifyToken = createVerifyIdToken({
    projectId: projectId || account.project_id,
    apiKey: env.FIREBASE_WEB_API_KEY || '',
  });

  const orderService = createOrderService({ db, serverTimestamp });

  return createWorkerApp({
    orderService,
    verifyToken,
    allowedOrigins: env.CORS_ALLOWED_ORIGINS || '',
    mode: env.DEMO_MODE === 'false' ? 'live' : 'demo',
    projectId: projectId || account.project_id,
  });
}

export default {
  async fetch(request, env) {
    if (!cachedHandler) cachedHandler = buildHandler(env);
    return cachedHandler(request);
  },
};
