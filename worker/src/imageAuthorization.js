// Server-side image authorization.
//
// The Worker reads Firestore with admin-equivalent credentials, so Firestore
// Security Rules do NOT protect these lookups. Every decision here is made
// from the verified Firebase token uid plus the authoritative Firestore user
// and restaurant documents. Client-supplied uid, role, ownerId, or membership
// is never trusted.

'use strict';

import { UpstreamUnavailableError } from './errors.js';

export class ImageAuthorizationError extends Error {
  constructor(code, message, status = 403) {
    super(message);
    this.name = 'ImageAuthorizationError';
    this.code = code;
    this.status = status;
  }
}

async function readDocument(db, path) {
  try {
    if (db && typeof db.getDocument === 'function') {
      return await db.getDocument(path);
    }
    return null;
  } catch {
    throw new UpstreamUnavailableError('Firestore authorization lookup failed.');
  }
}

function dataOf(snapshot) {
  return snapshot && snapshot.exists && typeof snapshot.data === 'function'
    ? snapshot.data()
    : null;
}

function isMemberOf(profile, restaurantId) {
  if (!profile || !restaurantId) return false;
  if (profile.restaurantId === restaurantId) return true;
  return Boolean(
    profile.restaurantIds &&
      typeof profile.restaurantIds === 'object' &&
      profile.restaurantIds[restaurantId] === true
  );
}

/**
 * Require a registered Firebase account whose Firestore profile exists.
 * Anonymous Firebase sessions are rejected by the transport before this point.
 */
export async function requireRegisteredProfile(db, uid) {
  const snapshot = await readDocument(db, `users/${uid}`);
  const profile = dataOf(snapshot);
  if (!profile) {
    throw new ImageAuthorizationError(
      'image_profile_not_found',
      'A registered profile is required to manage this image.'
    );
  }
  if (profile.uid && profile.uid !== uid) {
    throw new ImageAuthorizationError(
      'image_profile_mismatch',
      'The image owner could not be verified.'
    );
  }
  return profile;
}

/**
 * Require a restaurant_owner or restaurant_admin whose authoritative profile
 * grants access to the target restaurant.
 *
 * Owners are additionally checked against restaurants/{id}.ownerId. Admins are
 * checked against the authoritative restaurant document and profile membership.
 */
export async function requireRestaurantManager(db, uid, restaurantId) {
  const profile = await requireRegisteredProfile(db, uid);
  const role = profile.role;
  const manager =
    role === 'restaurant_owner' || role === 'restaurant_admin';
  if (!manager || !isMemberOf(profile, restaurantId)) {
    throw new ImageAuthorizationError(
      'image_restaurant_forbidden',
      'You are not authorized to manage images for this restaurant.'
    );
  }

  const restaurantSnapshot = await readDocument(db, `restaurants/${restaurantId}`);
  const restaurant = dataOf(restaurantSnapshot);
  if (!restaurant) {
    throw new ImageAuthorizationError(
      'image_restaurant_not_found',
      'The restaurant could not be verified.'
    );
  }

  if (role === 'restaurant_owner' && restaurant.ownerId !== uid) {
    throw new ImageAuthorizationError(
      'image_restaurant_forbidden',
      'You are not authorized to manage images for this restaurant.'
    );
  }

  return { profile, restaurant };
}

/**
 * Read a Firestore document for current-reference checks. Missing documents
 * are represented as null. Firestore failures are dependency failures.
 */
export async function getDocumentData(db, path) {
  const snapshot = await readDocument(db, path);
  return dataOf(snapshot);
}

export { isMemberOf };
