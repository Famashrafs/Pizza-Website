// Client gateway to the trusted order server.
//
// The storefront NEVER writes an order document directly — `firestore.rules`
// denies client `orders` creation outright. This module wraps the trusted
// server path, serializes the checkout request exactly as the server expects,
// and maps transport/function errors back to the service result shape
// ({ success, errors, error, order, reuse, trackingToken }) so callers keep
// working regardless of which transport is active.
//
// The transport is CONFIGURABLE:
//
//   - REACT_APP_API_BASE_URL set   → free-tier demo HTTP API (Express/Render).
//   - REACT_APP_API_BASE_URL unset → Firebase callable (`createOrder` /
//     `getGuestOrder` v2 onCall), the production path once the project is on
//     Blaze. Nothing else needs to change to migrate back: deploy the functions
//     and unset the variable.
//
// Both transports return the same JSON body. The public methods
// (`placeOrderViaGateway`, `getGuestOrderViaGateway`) are unchanged so
// `orderService` and the checkout UI do not care which one is used.

import { getFunctions, httpsCallable } from 'firebase/functions';
import app, { auth } from '../firebase';

const rawBase = (process.env.REACT_APP_API_BASE_URL || '').trim();
export const API_BASE_URL = rawBase.replace(/\/+$/, '');
export const transport = API_BASE_URL ? 'http' : 'callable';

let callable = null;
let guestLookupCallable = null;

function getCallable() {
  if (!callable) {
    callable = httpsCallable(getFunctions(app), 'createOrder');
  }
  return callable;
}

function getGuestLookupCallable() {
  if (!guestLookupCallable) {
    guestLookupCallable = httpsCallable(getFunctions(app), 'getGuestOrder');
  }
  return guestLookupCallable;
}

// A fresh Firebase ID token for the current session. Anonymous guest sessions
// carry one too, so the backend can identify the caller for either account type.
async function getIdToken() {
  const user = auth && auth.currentUser;
  if (!user || typeof user.getIdToken !== 'function') return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

// POSTs JSON to the demo API and normalizes failures into `functions/*` codes
// so the error mapping below is shared by both transports.
async function postHttp(path, body) {
  const token = await getIdToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(
      (data && data.error) || `The order server responded with ${res.status}.`
    );
    err.code =
      res.status === 401 ? 'functions/unauthenticated' : 'functions/unavailable';
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function placeOrderViaGateway(payload) {
  try {
    let data;
    if (transport === 'http') {
      data = await postHttp('/api/orders/create', payload);
    } else {
      const response = await getCallable()(payload);
      data = response && response.data;
    }

    if (data && typeof data === 'object') {
      return data;
    }
    return {
      success: false,
      error: 'The order server returned an unexpected response. Please try again.',
    };
  } catch (err) {
    // Keep the cart so the customer can retry. Firebase Functions errors carry
    // codes like functions/unavailable, functions/internal, functions/unauthenticated.
    console.error('[orderGateway] createOrder failed:', {
      code: err?.code,
      message: err?.message,
      details: err?.details,
    });

    if (err && err.code === 'functions/unauthenticated') {
      return {
        success: false,
        error: 'Your session expired. Please sign in again and retry your order.',
      };
    }

    let friendly = 'The order server is temporarily unavailable. Please try again.';
    if (err?.message) {
      friendly = `${friendly} (${String(err.message).split('\n')[0].slice(0, 120)})`;
    }

    return { success: false, error: friendly };
  }
}

// Secure guest-order lookup (confirmation page recovery). Requires the
// high-entropy token the createOrder response delivered once; an order id alone
// is never enough. Returns the same { success, order, error } shape.
export async function getGuestOrderViaGateway({ orderId, token }) {
  try {
    let data;
    if (transport === 'http') {
      data = await postHttp('/api/orders/guest-lookup', { orderId, token });
    } else {
      const response = await getGuestLookupCallable()({ orderId, token });
      data = response && response.data;
    }

    if (data && typeof data === 'object') {
      return data;
    }
    return { success: false, error: 'Order not found.' };
  } catch (err) {
    console.error('[orderGateway] getGuestOrder failed:', {
      code: err?.code,
      message: err?.message,
    });
    return { success: false, error: 'Order not found.' };
  }
}

const orderGateway = { placeOrderViaGateway, getGuestOrderViaGateway };

export default orderGateway;
