// Authoritative Firestore-backed image authorization tests.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ImageAuthorizationError,
  getDocumentData,
  requireRegisteredProfile,
  requireRestaurantManager,
} from '../src/imageAuthorization.js';

const RESTAURANT_ID = 'restaurant-pizza-demo';

function snapshot(data) {
  return {
    exists: data != null,
    data: () => data,
  };
}

function dbFrom(docs = {}) {
  return {
    async getDocument(path) {
      return snapshot(Object.prototype.hasOwnProperty.call(docs, path) ? docs[path] : null);
    },
  };
}

function authorizationFailure(code, status = 403) {
  return (err) => {
    assert.equal(err.name, 'ImageAuthorizationError');
    assert.equal(err.code, code);
    assert.equal(err.status, status);
    return true;
  };
}

test('a registered profile is resolved from the verified uid', async () => {
  const profile = await requireRegisteredProfile(
    dbFrom({ 'users/customer-1': { uid: 'customer-1', role: 'customer' } }),
    'customer-1'
  );
  assert.equal(profile.role, 'customer');
});

test('a missing profile or a profile owned by another uid is rejected', async () => {
  await assert.rejects(
    () => requireRegisteredProfile(dbFrom(), 'customer-1'),
    authorizationFailure('image_profile_not_found')
  );

  await assert.rejects(
    () =>
      requireRegisteredProfile(
        dbFrom({ 'users/customer-1': { uid: 'victim-1', role: 'customer' } }),
        'customer-1'
      ),
    authorizationFailure('image_profile_mismatch')
  );
});

test('a restaurant owner must match both authoritative membership and ownerId', async () => {
  const db = dbFrom({
    'users/owner-1': {
      uid: 'owner-1',
      role: 'restaurant_owner',
      restaurantId: RESTAURANT_ID,
    },
    [`restaurants/${RESTAURANT_ID}`]: {
      ownerId: 'owner-1',
    },
  });

  const result = await requireRestaurantManager(db, 'owner-1', RESTAURANT_ID);
  assert.equal(result.profile.uid, 'owner-1');
  assert.equal(result.restaurant.ownerId, 'owner-1');
});

test('an owner cannot manage another restaurant even with a spoofed client role', async () => {
  const db = dbFrom({
    'users/owner-1': {
      uid: 'owner-1',
      role: 'restaurant_owner',
      restaurantId: RESTAURANT_ID,
    },
    [`restaurants/${RESTAURANT_ID}`]: { ownerId: 'someone-else' },
  });

  await assert.rejects(
    () => requireRestaurantManager(db, 'owner-1', RESTAURANT_ID),
    authorizationFailure('image_restaurant_forbidden')
  );
});

test('a restaurant admin needs authoritative restaurantIds membership', async () => {
  const allowed = dbFrom({
    'users/admin-1': {
      uid: 'admin-1',
      role: 'restaurant_admin',
      restaurantIds: { [RESTAURANT_ID]: true },
    },
    [`restaurants/${RESTAURANT_ID}`]: { ownerId: 'owner-1' },
  });
  await assert.doesNotReject(() =>
    requireRestaurantManager(allowed, 'admin-1', RESTAURANT_ID)
  );

  const denied = dbFrom({
    'users/admin-1': {
      uid: 'admin-1',
      role: 'restaurant_admin',
      restaurantIds: { 'other-restaurant': true },
    },
    [`restaurants/${RESTAURANT_ID}`]: { ownerId: 'owner-1' },
  });
  await assert.rejects(
    () => requireRestaurantManager(denied, 'admin-1', RESTAURANT_ID),
    authorizationFailure('image_restaurant_forbidden')
  );
});

test('a customer cannot become a restaurant manager through request data', async () => {
  const db = dbFrom({
    'users/customer-1': {
      uid: 'customer-1',
      role: 'customer',
      restaurantId: RESTAURANT_ID,
    },
    [`restaurants/${RESTAURANT_ID}`]: { ownerId: 'owner-1' },
  });

  await assert.rejects(
    () => requireRestaurantManager(db, 'customer-1', RESTAURANT_ID),
    authorizationFailure('image_restaurant_forbidden')
  );
});

test('a Firestore authorization lookup failure is reported as unavailable', async () => {
  const db = {
    async getDocument() {
      throw new Error('firestore details must not reach the client');
    },
  };

  await assert.rejects(
    () => requireRegisteredProfile(db, 'customer-1'),
    (err) => {
      assert.equal(err.name, 'UpstreamUnavailableError');
      assert.match(err.message, /authorization lookup failed/i);
      return true;
    }
  );
});

test('getDocumentData returns nested authoritative documents and null for missing data', async () => {
  const db = dbFrom({
    [`restaurants/${RESTAURANT_ID}/categories/cat-1`]: {
      image: 'category.png',
    },
  });

  assert.deepEqual(
    await getDocumentData(db, `restaurants/${RESTAURANT_ID}/categories/cat-1`),
    { image: 'category.png' }
  );
  assert.equal(
    await getDocumentData(db, `restaurants/${RESTAURANT_ID}/categories/missing`),
    null
  );
});

// Keep the custom error class exported and recognizable for route mapping.
assert.ok(ImageAuthorizationError.prototype instanceof Error);
