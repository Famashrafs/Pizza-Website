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
// Startup model (why this file is defensive):
//   - Nothing Firebase-related is built while the module is evaluated. A
//     missing or malformed secret therefore CANNOT crash the Worker at load
//     time (which Cloudflare answers with a bare "Error 1101" page and no CORS
//     headers).
//   - The Firebase stack is built lazily, on the first request that actually
//     needs it, and the failure is remembered and reported as a generic 503
//     with CORS headers instead of an uncaught exception.
//   - /health and /api/diagnostics never build it: they only REPORT its state,
//     so a broken deployment stays diagnosable (and a health probe never
//     depends on Firebase being reachable).
//   - No exception ever escapes `fetch`: the top-level guard turns anything
//     unexpected into a JSON error response with CORS headers.
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
import { parseAllowedOrigins, corsHeadersForRequest } from './cors.js';
import { ConfigurationError, isConfigurationError, safeErrorMessage } from './errors.js';

/**
 * Build the Worker entry point around an explicit cache.
 *
 * The cache holds the per-isolate singletons (the transport and the Firebase
 * stack). Tests can pass their own cache object to get a fully isolated
 * instance; production uses the shared default.
 *
 * @param {object} [cache]
 * @returns {{ fetch: (request: Request, env: object) => Promise<Response> }}
 */
export function createWorkerEntrypoint(cache = {}) {
  const state = {
    app: null,
    services: null,
    initError: null,
    ...cache,
  };

  // Builds the Firebase/Firestore stack. May throw a ConfigurationError.
  function buildServices(env) {
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

    return { orderService, verifyToken };
  }

  function getServices(env) {
    if (state.services) return state.services;
    if (state.initError) throw state.initError;
    try {
      state.services = buildServices(env);
      return state.services;
    } catch (err) {
      state.initError = isConfigurationError(err)
        ? err
        : new ConfigurationError(
            'service_init_failed',
            'The order service could not be initialised.'
          );
      console.error('[worker] init failed:', safeErrorMessage(err));
      throw state.initError;
    }
  }

  // The transport itself never touches Firebase: the order routes resolve the
  // Firebase-backed pieces lazily, so /health and /api/diagnostics work even
  // when the credentials are missing or broken.
  function getApp(env) {
    if (state.app) return state.app;

    const orderService = {
      createOrder: (arg) => getServices(env).orderService.createOrder(arg),
      getGuestOrder: (arg) => getServices(env).orderService.getGuestOrder(arg),
    };
    const verifyToken = (token) => getServices(env).verifyToken(token);

    state.app = createWorkerApp({
      orderService,
      verifyToken,
      allowedOrigins: env.CORS_ALLOWED_ORIGINS || '',
      mode: env.DEMO_MODE === 'false' ? 'live' : 'demo',
      projectId: env.FIREBASE_PROJECT_ID || null,
      getServiceStatus: () => readServiceStatus(env),
    });
    return state.app;
  }

  // Reports the state of the Firebase-backed dependencies. The check is purely
  // LOCAL (JSON parsing of the secret — no network call, no token minting, no
  // Firestore access), so a health probe stays fast and never depends on
  // Firebase being reachable. An operator still sees exactly WHY a deployment
  // is broken (missing / invalid JSON / incomplete service account).
  function readServiceStatus(env) {
    if (state.services) return { firebase: { state: 'ready' } };
    if (state.initError) {
      return { firebase: { state: 'error', code: state.initError.code } };
    }
    try {
      parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      return { firebase: { state: 'configured' } };
    } catch (err) {
      const code = isConfigurationError(err) ? err.code : 'service_init_failed';
      return { firebase: { state: 'error', code } };
    }
  }

  // Last line of defence: an exception here would become a Cloudflare 1101
  // page without CORS headers. Convert it into a normal JSON error instead.
  function errorResponse(request, env, err) {
    console.error('[worker] unhandled error:', safeErrorMessage(err));
    const origin = request.headers.get('Origin');
    const allowed = parseAllowedOrigins((env && env.CORS_ALLOWED_ORIGINS) || '');
    const config = isConfigurationError(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: config
          ? 'The order service is temporarily unavailable. Please try again.'
          : 'The order server encountered an error.',
      }),
      {
        status: config ? 503 : 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeadersForRequest(origin, allowed),
        },
      }
    );
  }

  return {
    async fetch(request, env) {
      try {
        const handle = getApp(env);
        return await handle(request);
      } catch (err) {
        return errorResponse(request, env, err);
      }
    },
  };
}

export default createWorkerEntrypoint();
