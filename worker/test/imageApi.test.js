// Image service tests: authorization, canonical paths, conservative deletion,
// private profile references, and failure cleanup behaviour.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createImageApi } from '../src/imageApi.js';
import {
  StorageConflictError,
  UpstreamUnavailableError,
} from '../src/errors.js';
import { IMAGE_KINDS, STORAGE_BUCKETS } from '../src/imageValidation.js';

const RESTAURANT_ID = 'restaurant-pizza-demo';
const OBJECT_ID = '123e4567-e89b-42d3-a456-426614174000';
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function snapshot(data) {
  return { exists: data != null, data: () => data };
}

function makeDb(docs = {}) {
  return {
    writes: 0,
    async getDocument(path) {
      return snapshot(Object.prototype.hasOwnProperty.call(docs, path) ? docs[path] : null);
    },
    async setDoc() {
      this.writes += 1;
      throw new Error('The image service must not write Firestore references.');
    },
    async updateDoc() {
      this.writes += 1;
      throw new Error('The image service must not write Firestore references.');
    },
  };
}

function makeStorage(overrides = {}) {
  return {
    calls: [],
    async upload(bucket, path, bytes, contentType) {
      this.calls.push({ op: 'upload', bucket, path, bytes, contentType });
      return { bucket, path, id: OBJECT_ID };
    },
    async remove(bucket, path) {
      this.calls.push({ op: 'remove', bucket, path });
      return true;
    },
    publicUrl(bucket, path) {
      return `https://supabase.test/storage/v1/object/public/${bucket}/${path}`;
    },
    async createSignedUrl(bucket, path, expiresIn) {
      this.calls.push({ op: 'signed', bucket, path, expiresIn });
      return `https://supabase.test/storage/v1/object/sign/${bucket}/${path}?token=signed`;
    },
    ...overrides,
  };
}

function ownerDocs() {
  return {
    'users/owner-1': {
      uid: 'owner-1',
      role: 'restaurant_owner',
      restaurantId: RESTAURANT_ID,
    },
    [`restaurants/${RESTAURANT_ID}`]: { ownerId: 'owner-1' },
  };
}

function customerDocs() {
  return {
    'users/customer-1': { uid: 'customer-1', role: 'customer' },
  };
}

function uploadRequest({
  kind = IMAGE_KINDS.CUSTOMER_PROFILE,
  restaurantId = '',
  filename = 'image.png',
  contentType = 'image/png',
  bytes = PNG,
} = {}) {
  const headers = {
    Authorization: 'Bearer verified-token',
    'Content-Type': contentType,
    'X-Image-Kind': kind,
    'X-Original-Filename': filename,
  };
  if (restaurantId) headers['X-Restaurant-Id'] = restaurantId;

  return new Request('https://api.test/api/images/upload', {
    method: 'POST',
    headers,
    body: bytes,
  });
}

function jsonRequest(path, body) {
  return new Request(`https://api.test${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer verified-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function deleteRequest(body) {
  return new Request('https://api.test/api/images', {
    method: 'DELETE',
    headers: {
      Authorization: 'Bearer verified-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function makeApi({ docs = {}, storage = makeStorage() } = {}) {
  const db = makeDb(docs);
  const api = createImageApi({
    db,
    storage,
    randomUUID: () => OBJECT_ID,
    now: () => Date.parse('2026-01-01T00:00:00.000Z'),
  });
  return { api, db, storage };
}

test('an authenticated customer uploads a private profile image using the verified uid path', async () => {
  const { api, db, storage } = makeApi({ docs: customerDocs() });

  const result = await api.upload({
    request: uploadRequest(),
    auth: { uid: 'customer-1', token: { sub: 'customer-1' } },
  });

  assert.equal(result.success, true);
  assert.equal(result.bucket, STORAGE_BUCKETS.PROFILE_IMAGES);
  assert.equal(result.reference, `users/customer-1/profile/${OBJECT_ID}.png`);
  assert.equal(result.objectPath, result.reference);
  assert.equal(result.url, null, 'a private profile upload must not return a public URL');
  assert.equal(storage.calls.length, 1);
  assert.equal(storage.calls[0].op, 'upload');
  assert.equal(storage.calls[0].bucket, STORAGE_BUCKETS.PROFILE_IMAGES);
  assert.equal(storage.calls[0].path, result.objectPath);
  assert.equal(db.writes, 0, 'upload must not create a Firestore reference');
});

test('a customer cannot upload a restaurant asset', async () => {
  const { api, storage } = makeApi({
    docs: {
      ...customerDocs(),
      [`restaurants/${RESTAURANT_ID}`]: { ownerId: 'owner-1' },
    },
  });

  await assert.rejects(
    () =>
      api.upload({
        request: uploadRequest({
          kind: IMAGE_KINDS.PRODUCT,
          restaurantId: RESTAURANT_ID,
        }),
        auth: { uid: 'customer-1', token: { sub: 'customer-1' } },
      }),
    (err) => {
      assert.equal(err.name, 'ImageAuthorizationError');
      assert.equal(err.code, 'image_restaurant_forbidden');
      assert.equal(err.status, 403);
      return true;
    }
  );
  assert.equal(storage.calls.length, 0);
});

test('a restaurant owner uploads a product asset and no old object is deleted', async () => {
  const { api, db, storage } = makeApi({ docs: ownerDocs() });

  const result = await api.upload({
    request: uploadRequest({
      kind: IMAGE_KINDS.PRODUCT,
      restaurantId: RESTAURANT_ID,
    }),
    auth: { uid: 'owner-1', token: { sub: 'owner-1' } },
  });

  assert.equal(result.bucket, STORAGE_BUCKETS.RESTAURANT_ASSETS);
  assert.equal(result.objectPath, `products/${RESTAURANT_ID}/${OBJECT_ID}.png`);
  assert.equal(
    result.url,
    `https://supabase.test/storage/v1/object/public/${STORAGE_BUCKETS.RESTAURANT_ASSETS}/${result.objectPath}`
  );
  assert.deepEqual(
    storage.calls.map((call) => call.op),
    ['upload'],
    'replacement uploads must not delete the previous image'
  );
  assert.equal(db.writes, 0);
});

test('profile signed URLs are self-only and never expose a public profile URL', async () => {
  const { api, storage } = makeApi({ docs: customerDocs() });

  await assert.rejects(
    () =>
      api.signedUrl({
        request: jsonRequest('/api/images/profile/signed-url', {
          path: `users/customer-2/profile/${OBJECT_ID}.png`,
        }),
        auth: { uid: 'customer-1', token: { sub: 'customer-1' } },
      }),
    (err) => {
      assert.equal(err.name, 'ImageAuthorizationError');
      assert.equal(err.code, 'image_profile_forbidden');
      return true;
    }
  );

  const ownPath = `users/customer-1/profile/${OBJECT_ID}.png`;
  const result = await api.signedUrl({
    request: jsonRequest('/api/images/profile/signed-url', { path: ownPath }),
    auth: { uid: 'customer-1', token: { sub: 'customer-1' } },
  });

  assert.equal(result.path, ownPath);
  assert.match(result.url, /\/object\/sign\/profile-images\//);
  assert.equal(result.expiresAt, '2026-01-01T00:05:00.000Z');
  assert.equal(storage.calls[0].bucket, STORAGE_BUCKETS.PROFILE_IMAGES);
  assert.equal(storage.calls[0].expiresIn, 300);
  assert.ok(!Object.values(result).some((value) => String(value).includes('/object/public/')));
});

test('a current Firestore image reference cannot be deleted', async () => {
  const path = `products/${RESTAURANT_ID}/${OBJECT_ID}.png`;
  const { api, storage } = makeApi({
    docs: {
      ...ownerDocs(),
      'products/prod-1': {
        restaurantId: RESTAURANT_ID,
        image: `https://supabase.test/storage/v1/object/public/${STORAGE_BUCKETS.RESTAURANT_ASSETS}/${path}`,
      },
    },
  });

  await assert.rejects(
    () =>
      api.remove({
        request: deleteRequest({
          kind: IMAGE_KINDS.PRODUCT,
          path,
          restaurantId: RESTAURANT_ID,
          resourceId: 'prod-1',
          reason: 'orphan-cleanup',
        }),
        auth: { uid: 'owner-1', token: { sub: 'owner-1' } },
      }),
    (err) => {
      assert.equal(err.name, 'ImageRequestError');
      assert.equal(err.code, 'image_reference_in_use');
      assert.equal(err.status, 409);
      return true;
    }
  );
  assert.equal(storage.calls.length, 0);
});

test('an owner can explicitly remove an orphan public asset', async () => {
  const path = `products/${RESTAURANT_ID}/${OBJECT_ID}.png`;
  const { api, storage } = makeApi({
    docs: {
      ...ownerDocs(),
      'products/prod-1': {
        restaurantId: RESTAURANT_ID,
        image: 'https://supabase.test/storage/v1/object/public/restaurant-assets/old.png',
      },
    },
  });

  const result = await api.remove({
    request: deleteRequest({
      kind: IMAGE_KINDS.PRODUCT,
      path,
      restaurantId: RESTAURANT_ID,
      resourceId: 'prod-1',
      reason: 'orphan-cleanup',
    }),
    auth: { uid: 'owner-1', token: { sub: 'owner-1' } },
  });

  assert.equal(result.success, true);
  assert.equal(result.deleted, true);
  assert.deepEqual(storage.calls, [
    { op: 'remove', bucket: STORAGE_BUCKETS.RESTAURANT_ASSETS, path },
  ]);
});

test('deletion requires an explicit allowed reason and a safe resource id', async () => {
  const { api, storage } = makeApi({ docs: ownerDocs() });
  const path = `products/${RESTAURANT_ID}/${OBJECT_ID}.png`;

  await assert.rejects(
    () =>
      api.remove({
        request: deleteRequest({
          kind: IMAGE_KINDS.PRODUCT,
          path,
          restaurantId: RESTAURANT_ID,
          resourceId: 'prod-1',
        }),
        auth: { uid: 'owner-1', token: { sub: 'owner-1' } },
      }),
    (err) => err.code === 'image_delete_reason_missing'
  );

  await assert.rejects(
    () =>
      api.remove({
        request: deleteRequest({
          kind: IMAGE_KINDS.PRODUCT,
          path,
          restaurantId: RESTAURANT_ID,
          resourceId: '../users/victim',
          reason: 'orphan-cleanup',
        }),
        auth: { uid: 'owner-1', token: { sub: 'owner-1' } },
      }),
    (err) => {
      assert.equal(err.name, 'ImageValidationError');
      assert.equal(err.code, 'image_path_segment_invalid');
      return true;
    }
  );
  assert.equal(storage.calls.length, 0);
});

test('a customer cannot delete restaurant assets', async () => {
  const { api, storage } = makeApi({
    docs: {
      ...customerDocs(),
      [`restaurants/${RESTAURANT_ID}`]: { ownerId: 'owner-1' },
    },
  });
  const path = `products/${RESTAURANT_ID}/${OBJECT_ID}.png`;

  await assert.rejects(
    () =>
      api.remove({
        request: deleteRequest({
          kind: IMAGE_KINDS.PRODUCT,
          path,
          restaurantId: RESTAURANT_ID,
          resourceId: 'prod-1',
          reason: 'orphan-cleanup',
        }),
        auth: { uid: 'customer-1', token: { sub: 'customer-1' } },
      }),
    (err) => err.code === 'image_restaurant_forbidden'
  );
  assert.equal(storage.calls.length, 0);
});

test('a current private profile path cannot be deleted', async () => {
  const path = `users/customer-1/profile/${OBJECT_ID}.png`;
  const { api, storage } = makeApi({
    docs: {
      ...customerDocs(),
      'users/customer-1': {
        uid: 'customer-1',
        role: 'customer',
        photoPath: path,
      },
    },
  });

  await assert.rejects(
    () =>
      api.remove({
        request: deleteRequest({
          kind: IMAGE_KINDS.CUSTOMER_PROFILE,
          path,
          reason: 'profile-remove',
        }),
        auth: { uid: 'customer-1', token: { sub: 'customer-1' } },
      }),
    (err) => err.code === 'image_reference_in_use' && err.status === 409
  );
  assert.equal(storage.calls.length, 0);
});

test('an ambiguous upload timeout triggers cleanup of only the generated path', async () => {
  const storage = makeStorage({
    async upload(bucket, path, bytes, contentType) {
      this.calls.push({ op: 'upload', bucket, path, bytes, contentType });
      throw new UpstreamUnavailableError('Supabase Storage request timed out.', {
        code: 'supabase_timeout',
        status: 504,
        cleanupMayHaveSucceeded: true,
      });
    },
  });
  const { api, db } = makeApi({ docs: customerDocs(), storage });

  await assert.rejects(
    () =>
      api.upload({
        request: uploadRequest(),
        auth: { uid: 'customer-1', token: { sub: 'customer-1' } },
      }),
    (err) => err.name === 'UpstreamUnavailableError'
  );

  assert.deepEqual(storage.calls.map((call) => call.op), ['upload', 'remove']);
  assert.equal(
    storage.calls[1].path,
    `users/customer-1/profile/${OBJECT_ID}.png`
  );
  assert.equal(db.writes, 0);
});

test('a definitive storage conflict never deletes the pre-existing object', async () => {
  const storage = makeStorage({
    async upload(bucket, path, bytes, contentType) {
      this.calls.push({ op: 'upload', bucket, path, bytes, contentType });
      throw new StorageConflictError();
    },
  });
  const { api, db } = makeApi({ docs: customerDocs(), storage });

  await assert.rejects(
    () =>
      api.upload({
        request: uploadRequest(),
        auth: { uid: 'customer-1', token: { sub: 'customer-1' } },
      }),
    (err) => err.name === 'StorageConflictError' && err.status === 409
  );

  assert.deepEqual(storage.calls.map((call) => call.op), ['upload']);
  assert.equal(db.writes, 0);
});
