// Client gateway to the trusted `createOrder` Cloud Function.
//
// The storefront NEVER writes an order document directly — `firestore.rules`
// denies client `orders` creation outright. This module wraps the Firebase
// callable, serializes the checkout request exactly as the function expects,
// and maps transport/function errors back to the service result shape
// ({ success, errors, error, order, reuse }) so callers keep working whether
// the function is reachable or not.

import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../firebase';

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

export async function placeOrderViaGateway(payload) {
  try {
    const response = await getCallable()(payload);
    const data = response && response.data;
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
    const response = await getGuestLookupCallable()({ orderId, token });
    const data = response && response.data;
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