// Trusted order-creation Cloud Function.
//
// This is the ONLY path that may create orders. The web app calls
// `createOrder` and the function:
//
//   1. re-validates the caller (registered OR anonymous guest — guest checkout
//      is intentionally supported; the anonymous provider is detected here),
//   2. recomputes EVERY price server-side from the live catalog and the
//      AUTHORITATIVE restaurant settings document READ INSIDE the transaction
//      (never trusts client money, never prices against data read before the
//      transaction began),
//   3. enforces idempotency CONCURRENTLY via a Firestore transaction backed by
//      a `checkoutReceipts/{sha1(uid:restaurantId:checkoutId)}` document, so a
//      double-click / retry can never mint two orders, and
//   4. writes paymentStatus "pending" for cash — it never marks an order paid
//      without a provider verification.
//
// The function uses the Admin SDK, so it bypasses `firestore.rules`. Those rules
// deny client-side `orders` creation entirely (see firestore.rules).

'use strict';

const { onCall } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');
const { buildOrder, verifyGuestToken, buildRequestSignature, generateGuestToken, sha256hex } = require('./lib/orderCore');
const { RESTAURANT_ID } = require('./lib/restaurantDefaults');

initializeApp();

const db = getFirestore();

// A receipt doc only ever exists after a successful, transactional order write.
const receiptId = (uid, restaurantId, checkoutId) =>
  crypto
    .createHash('sha1')
    .update(`${uid}:${restaurantId}:${checkoutId || ''}`)
    .digest('hex');

// Converts Firestore Timestamps in an order doc into ISO strings so the values
// survive callable serialization and match the client's read path exactly.
function serializeOrder(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const stamp = (value) =>
    value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value;
  return {
    ...doc,
    createdAt: stamp(doc.createdAt),
    updatedAt: stamp(doc.updatedAt),
    cancelledAt: stamp(doc.cancelledAt),
    statusUpdatedAt: stamp(doc.statusUpdatedAt),
    statusHistory: Array.isArray(doc.statusHistory)
      ? doc.statusHistory.map((entry) => ({ ...entry, at: stamp(entry.at) }))
      : doc.statusHistory,
  };
}

// The persisted guest token is a SHA-256 hash, never the raw secret. Drop it
// from anything the client is handed (the raw token travels only in the
// createOrder response, exactly once, and is saved by the client locally).
function withoutGuestToken(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const { guestTokenHash: _hash, ...rest } = doc;
  return rest;
}

// Strip anything that is not plain JSON (dates, firestore types, undefined) so
// the payload the client sent arrives as tidy primitives/arrays/objects.
function sanitize(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      if (value[key] !== undefined) out[key] = sanitize(value[key]);
    }
    return out;
  }
  return value;
}

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

// Strip the guest token hash from a client-shaped order (already ISO-serialized).
function serializedShaped(order) {
  return withoutGuestToken(serializeOrder(order));
}

// --- Secure guest order lookup ------------------------------------------------
//
// Refresh-safe tracking for guest checkout. A guest has no account, so the
// confirmation page cannot re-read the order through the normal
// `orders/{id}` -> `customerId` rules path. Instead the checkout response
// delivered the guest a high-entropy token ONCE; this callable accepts that
// token plus the order id and verifies it against the SHA-256 hash the order
// doc carries. Without the token — or with a wrong one — the lookup denies
// with a generic "Order not found" so order ids alone are never enough to read
// a guest's private order details.

exports.getGuestOrder = onCall(async (first, context) => {
  const { data } = readRequest(first, context);
  const orderId = String((data && data.orderId) || '').trim();
  const token = String((data && data.token) || '');

  if (!orderId || !token) {
    return { success: false, error: 'Order not found.' };
  }

  const snap = await db.collection('orders').doc(orderId).get();
  if (!snap.exists) {
    return { success: false, error: 'Order not found.' };
  }

  const doc = snap.data();
  if (!verifyGuestToken(token, doc.guestTokenHash)) {
    return { success: false, error: 'Order not found.' };
  }

  return { success: true, order: serializedShaped({ ...doc, id: snap.id }) };
});

exports.createOrder = onCall(async (first, context) => {
  const { data: rawData, auth } = readRequest(first, context);
  const uid = (auth && auth.uid) || null;
  const isAnonymous = Boolean(
    auth &&
      auth.token &&
      auth.token.firebase &&
      auth.token.firebase.sign_in_provider === 'anonymous'
  );

  if (!uid) {
    return {
      success: false,
      error: 'You must be signed in to place an order.',
      errors: { auth: 'You must be signed in to place an order.' },
    };
  }

  const payload = sanitize((rawData && rawData.data) || rawData || {}) || {};
  const restaurantId = String(payload.restaurantId || RESTAURANT_ID);
  const checkoutId = String(payload.idempotencyKey || '');

  // Fingerprint of the logical checkout, stored with the idempotency receipt so
  // a replayed key that carries a DIFFERENT cart/contact can never silently
  // resolve to the original order.
  const requestSignature = buildRequestSignature({ ...payload, restaurantId });

  const restaurantRef = db.collection('restaurants').doc(restaurantId);
  const productsQuery = db
    .collection('products')
    .where('restaurantId', '==', restaurantId);
  const receiptRef = db.collection('checkoutReceipts').doc(
    receiptId(uid, restaurantId, checkoutId)
  );

  const result = await db.runTransaction(async (tx) => {
    // --- READS (every read must precede any write in a Firestore transaction) --
    //
    // The AUTHORITATIVE restaurant settings and the restaurant's catalog are read
    // INSIDE the transaction. If an owner edits a price, tax rate, delivery fee
    // or availability while this checkout is in flight, the transaction detects
    // the read conflict, retries, and rebuilds the order from the NEW values —
    // so the committed order and its totals can never be computed from stale
    // pricing read before the transaction began.
    const restaurantSnap = await tx.get(restaurantRef);
    const products = [];
    if (restaurantSnap.exists) {
      const productsSnap = await tx.get(productsQuery);
      productsSnap.forEach((doc) => products.push({ ...doc.data(), id: doc.id }));
    }

    const existing = await tx.get(receiptRef);
    if (existing.exists) {
      const receipt = existing.data();
      // The receipt id already binds `uid:restaurantId:checkoutId`, but pin the
      // stored identity as well: a receipt may only ever be replayed by the SAME
      // requester for the SAME restaurant, so another customer/guest cannot
      // reuse this key to reach someone else's order.
      if (
        (receipt.uid && receipt.uid !== uid) ||
        (receipt.restaurantId && receipt.restaurantId !== restaurantId)
      ) {
        return {
          success: false,
          error: 'This checkout could not be verified. Please start a new checkout.',
          errors: {},
        };
      }
      const orderRef = db.collection('orders').doc(receipt.orderId);
      const orderDoc = await tx.get(orderRef);
      if (orderDoc.exists) {
        // Reuse is ONLY valid for the same logical checkout. A stale or reused
        // idempotency key carrying a different payload resolves to nothing
        // rather than to the wrong order. (Legacy receipts have no hash and are
        // reused as before.)
        if (receipt.requestHash && receipt.requestHash !== requestSignature) {
          return {
            success: false,
            error:
              'This checkout could not be verified. Please start a new checkout.',
            errors: {},
          };
        }
        const orderData = orderDoc.data();
        // A guest has no account, so refresh-safe tracking relies entirely on
        // the capability token, of which only the hash is stored. A legitimate
        // retry after a lost response ROTATES the token: the fresh plaintext is
        // returned exactly once and the previous token stops working. Rotation
        // happens inside the transaction, so concurrent retries are serialized
        // by the lock and cannot leave two live tokens behind.
        if (orderData.guestTokenHash) {
          const rotatedToken = generateGuestToken();
          tx.update(orderRef, {
            guestTokenHash: sha256hex(rotatedToken),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return {
            success: true,
            reuse: true,
            orderId: receipt.orderId,
            order: serializedShaped(orderData),
            trackingToken: rotatedToken,
          };
        }
        return {
          success: true,
          reuse: true,
          orderId: receipt.orderId,
          order: serializedShaped(orderData),
        };
      }
      // Receipt survived but the order was deleted — recreate below.
    }

    const built = buildOrder({
      uid,
      isAnonymous,
      restaurantId,
      restaurantExists: restaurantSnap.exists,
      settings: restaurantSnap.exists ? restaurantSnap.data() : null,
      products,
      cartItems: payload.items,
      customer: payload.customer || {},
      fulfillmentType: payload.fulfillmentType || 'delivery',
      address: payload.address || null,
      paymentMethod: payload.paymentMethod || '',
      customerNotes: payload.customerNotes || '',
      promoCode: payload.promoCode || '',
      idempotencyKey: checkoutId || null,
    });

    if (!built.success) return { success: false, ...built };

    const orderRef = db.collection('orders').doc(built.orderId);
    // Store authoritative server timestamps; the response carries ISO strings.
    const { createdAt: _c, updatedAt: _u, ...docWithoutStamps } = built.order;
    const stored = {
      ...docWithoutStamps,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    tx.set(receiptRef, {
      uid,
      restaurantId,
      checkoutId,
      orderId: built.orderId,
      requestHash: requestSignature,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(orderRef, stored);

    return {
      success: true,
      reuse: false,
      orderId: built.orderId,
      order: serializedShaped(built.order),
      trackingToken: built.trackingToken || null,
    };
  });

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    reuse: Boolean(result.reuse),
    order: result.order,
    ...(result.trackingToken ? { trackingToken: result.trackingToken } : {}),
  };
});