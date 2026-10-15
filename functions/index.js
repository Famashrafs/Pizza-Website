// Trusted order-creation Cloud Function (Firebase callable transport).
//
// This is the Firebase callable front door for the shared order engine in
// `./lib/orderServiceCore.js` — the SAME engine the free-tier demo HTTP API
// (`server/index.js`, Express on Render) calls. All authoritative pricing,
// idempotency, guest-token and schema logic lives in the shared core; this file
// only adapts the callable request shape to it.
//
// The function uses the Admin SDK, so it bypasses `firestore.rules`. Those rules
// deny client-side `orders` creation entirely (see firestore.rules), so the only
// way an order appears is through a trusted server path (this callable or the
// demo HTTP API).
//
// Callable exports (deployed as v2 onCall, default region us-central1):
//   - createOrder    — trusted order creation (registered OR anonymous caller),
//   - getGuestOrder  — token-verified guest order lookup.

'use strict';

const { onCall } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { createOrderService } = require('./lib/orderServiceCore');

initializeApp();

const db = getFirestore();

const service = createOrderService({
  db,
  serverTimestamp: () => FieldValue.serverTimestamp(),
});

// firebase-functions v2 callables evolved from `(data, context)` to a single
// `CallableRequest` argument. Detect both shapes so the function works across
// minor versions.
function readRequest(request, context) {
  if (request && typeof request === 'object' && 'data' in request && request.auth) {
    return { data: request.data, auth: request.auth };
  }
  return {
    data: request !== undefined ? request : undefined,
    auth: (context && context.auth) || null,
  };
}

exports.getGuestOrder = onCall(async (first, context) => {
  const { data } = readRequest(first, context);
  return service.getGuestOrder({ data });
});

exports.createOrder = onCall(async (first, context) => {
  const { data, auth } = readRequest(first, context);
  return service.createOrder({ data, auth });
});
