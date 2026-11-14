// Worker image route contract tests: Firebase-token gate, authoritative
// ownership, validation status codes, private profiles, conservative deletes,
// upstream failures, and production-origin CORS.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerApp } from '../src/app.js';
import { createImageApi } from '../src/imageApi.js';
import { IMAGE_KINDS, MAX_IMAGE_BYTES, STORAGE_BUCKETS } from '../src/imageValidation.js';
import {
  safeErrorMessage,
  StorageConflictError,
  UpstreamUnavailableError,
} from '../src/errors.js';

const RESTAURANT_ID = 'restaurant-pizza-demo';
const VERCEL_ORIGIN = 'https://pizza-website-famashrafs-projects.vercel.app';
const OBJECT_ID = '123e4567-e89b-42d3-a456-426614174000';
const SECRET = 'service-role-secret-that-must-not-leak';
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function snapshot(data) {
  return { exists: data != null, data: () => data };
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

function setup({ storage = makeStorage(), docs } = {}) {
  const baseDocs = {
    'users/owner-1': {
      uid: 'owner-1',
      role: 'restaurant_owner',
      restaurantId: RESTAURANT_ID,
    },
    'users/customer-1': { uid: 'customer-1', role: 'customer' },
    [`restaurants/${RESTAURANT_ID}`]: { ownerId: 'owner-1' },
    ...(docs || {}),
  };
  const db = {
    writes: 0,
    async getDocument(path) {
      return snapshot(
        Object.prototype.hasOwnProperty.call(baseDocs, path)
          ? baseDocs[path]
          : null
      );
    },
    async setDoc() {
      this.writes += 1;
      throw new Error('image routes must not write Firestore');
    },
  };
  const api = createImageApi({
    db,
    storage,
    randomUUID: () => OBJECT_ID,
    now: () => Date.parse('2026-01-01T00:00:00.000Z'),
  });
  const logs = [];
  const handle = createWorkerApp({
    orderService: {
      async createOrder() {
        return { success: true };
      },
      async getGuestOrder() {
        return { success: true };
      },
    },
    verifyToken: async (token) => {
      if (token === 'owner-token') {
        return { sub: 'owner-1', firebase: { sign_in_provider: 'password' } };
      }
      if (token === 'customer-token') {
        return { sub: 'customer-1', firebase: { sign_in_provider: 'password' } };
      }
      if (token === 'anonymous-token') {
        return { sub: 'guest-1', firebase: { sign_in_provider: 'anonymous' } };
      }
      if (token === 'missing-profile-token') {
        return { sub: 'missing-profile', firebase: { sign_in_provider: 'password' } };
      }
      throw new Error('invalid Firebase ID token');
    },
    imageService: api,
    allowedOrigins: `http://localhost:3000,${VERCEL_ORIGIN}`,
    logError: (err) => logs.push(safeErrorMessage(err, [SECRET])),
  });

  return { handle, storage, db, logs };
}

function uploadRequest({
  token = 'customer-token',
  kind = IMAGE_KINDS.CUSTOMER_PROFILE,
  restaurantId = '',
  filename = 'image.png',
  contentType = 'image/png',
  bytes = PNG,
  origin = VERCEL_ORIGIN,
} = {}) {
  const headers = {
    'Content-Type': contentType,
    'X-Image-Kind': kind,
    'X-Original-Filename': filename,
    Origin: origin,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (restaurantId) headers['X-Restaurant-Id'] = restaurantId;

  return new Request('https://api.test/api/images/upload', {
    method: 'POST',
    headers,
    body: bytes,
  });
}

function jsonRequest(path, body, { token = 'customer-token', method = 'POST', origin = VERCEL_ORIGIN } = {}) {
  return new Request(`https://api.test${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

test('profile upload requires a valid Firebase token and a registered profile', async () => {
  const { handle, storage } = setup();

  const missing = await handle(uploadRequest({ token: '' }));
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).code, 'image_unauthenticated');

  const invalid = await handle(uploadRequest({ token: 'invalid-token' }));
  assert.equal(invalid.status, 401);
  assert.equal((await invalid.json()).code, 'image_unauthenticated');

  const anonymous = await handle(uploadRequest({ token: 'anonymous-token' }));
  assert.equal(anonymous.status, 403);
  assert.equal((await anonymous.json()).code, 'image_anonymous_forbidden');

  const missingProfile = await handle(uploadRequest({ token: 'missing-profile-token' }));
  assert.equal(missingProfile.status, 403);
  assert.equal((await missingProfile.json()).code, 'image_profile_not_found');

  assert.equal(storage.calls.length, 0);
});

test('an authenticated customer can upload a private profile image', async () => {
  const { handle, storage, db } = setup();

  const res = await handle(uploadRequest());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.bucket, STORAGE_BUCKETS.PROFILE_IMAGES);
  assert.equal(body.reference, `users/customer-1/profile/${OBJECT_ID}.png`);
  assert.equal(body.url, null);
  assert.equal(storage.calls[0].op, 'upload');
  assert.equal(db.writes, 0);
});

test('a restaurant owner can upload a product image and a customer cannot', async () => {
  const { handle, storage } = setup();

  const owner = await handle(
    uploadRequest({
      token: 'owner-token',
      kind: IMAGE_KINDS.PRODUCT,
      restaurantId: RESTAURANT_ID,
    })
  );
  assert.equal(owner.status, 200);
  const ownerBody = await owner.json();
  assert.equal(ownerBody.objectPath, `products/${RESTAURANT_ID}/${OBJECT_ID}.png`);
  assert.match(ownerBody.url, /\/storage\/v1\/object\/public\/restaurant-assets\//);

  const customer = await handle(
    uploadRequest({
      token: 'customer-token',
      kind: IMAGE_KINDS.PRODUCT,
      restaurantId: RESTAURANT_ID,
    })
  );
  assert.equal(customer.status, 403);
  assert.equal((await customer.json()).code, 'image_restaurant_forbidden');
  assert.equal(storage.calls.length, 1);
});

test('identity comes from the verified token, never from client headers', async () => {
  const { handle } = setup();
  const request = uploadRequest();
  request.headers.set('X-User-Id', 'victim-uid');
  request.headers.set('X-Role', 'restaurant_owner');

  const res = await handle(request);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.reference, /^users\/customer-1\/profile\//);
  assert.ok(!body.reference.includes('victim-uid'));
});

test('signed profile URLs are self-only and private', async () => {
  const { handle } = setup();
  const ownPath = `users/customer-1/profile/${OBJECT_ID}.png`;

  const other = await handle(
    jsonRequest('/api/images/profile/signed-url', {
      path: `users/customer-2/profile/${OBJECT_ID}.png`,
    })
  );
  assert.equal(other.status, 403);
  assert.equal((await other.json()).code, 'image_profile_forbidden');

  const own = await handle(
    jsonRequest('/api/images/profile/signed-url', { path: ownPath })
  );
  assert.equal(own.status, 200);
  const body = await own.json();
  assert.equal(body.path, ownPath);
  assert.match(body.url, /\/object\/sign\/profile-images\//);
  assert.ok(!JSON.stringify(body).includes('/object/public/profile-images/'));
});

test('invalid MIME types, extensions, malformed bytes, and oversized files are rejected', async () => {
  const { handle, storage } = setup();

  const svg = await handle(
    uploadRequest({ filename: 'logo.svg', contentType: 'image/svg+xml' })
  );
  assert.equal(svg.status, 415);
  assert.equal((await svg.json()).code, 'image_mime_invalid');

  const mismatch = await handle(
    uploadRequest({ filename: 'photo.png', contentType: 'image/jpeg' })
  );
  assert.equal(mismatch.status, 415);
  assert.equal((await mismatch.json()).code, 'image_extension_mismatch');

  const malformed = await handle(
    uploadRequest({ bytes: new TextEncoder().encode('<svg onload=alert(1)>') })
  );
  assert.equal(malformed.status, 415);
  assert.equal((await malformed.json()).code, 'image_content_invalid');

  const oversized = await handle(
    uploadRequest({ bytes: new Uint8Array(MAX_IMAGE_BYTES + 1) })
  );
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).code, 'image_too_large');
  assert.equal(storage.calls.length, 0);
});

test('upload and delete path traversal attempts are rejected', async () => {
  const { handle, storage } = setup();

  const filename = await handle(uploadRequest({ filename: '../escape.png' }));
  assert.equal(filename.status, 400);
  assert.equal((await filename.json()).code, 'image_filename_invalid');

  const path = await handle(
    jsonRequest('/api/images/profile/signed-url', {
      path: `users/customer-1/profile/../../${OBJECT_ID}.png`,
    })
  );
  assert.equal(path.status, 400);
  assert.equal((await path.json()).code, 'image_path_invalid');

  const resource = await handle(
    jsonRequest(
      '/api/images',
      {
        kind: IMAGE_KINDS.PRODUCT,
        path: `products/${RESTAURANT_ID}/${OBJECT_ID}.png`,
        restaurantId: RESTAURANT_ID,
        resourceId: '../users/customer-1',
        reason: 'orphan-cleanup',
      },
      { token: 'owner-token', method: 'DELETE' }
    )
  );
  assert.equal(resource.status, 400);
  assert.equal((await resource.json()).code, 'image_path_segment_invalid');
  assert.equal(storage.calls.length, 0);
});

test('delete refuses the current Firestore reference', async () => {
  const path = `products/${RESTAURANT_ID}/${OBJECT_ID}.png`;
  const currentUrl = `https://supabase.test/storage/v1/object/public/${STORAGE_BUCKETS.RESTAURANT_ASSETS}/${path}`;
  const { handle, storage } = setup({
    docs: {
      'products/prod-1': { restaurantId: RESTAURANT_ID, image: currentUrl },
    },
  });

  const current = await handle(
    jsonRequest(
      '/api/images',
      {
        kind: IMAGE_KINDS.PRODUCT,
        path,
        restaurantId: RESTAURANT_ID,
        resourceId: 'prod-1',
        reason: 'orphan-cleanup',
      },
      { token: 'owner-token', method: 'DELETE' }
    )
  );
  assert.equal(current.status, 409);
  assert.equal((await current.json()).code, 'image_reference_in_use');
  assert.equal(storage.calls.length, 0);
});

test('a customer cannot delete restaurant assets', async () => {
  const { handle, storage } = setup();
  const path = `products/${RESTAURANT_ID}/${OBJECT_ID}.png`;

  const res = await handle(
    jsonRequest(
      '/api/images',
      {
        kind: IMAGE_KINDS.PRODUCT,
        path,
        restaurantId: RESTAURANT_ID,
        resourceId: 'prod-1',
        reason: 'orphan-cleanup',
      },
      { token: 'customer-token', method: 'DELETE' }
    )
  );
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'image_restaurant_forbidden');
  assert.equal(storage.calls.length, 0);
});

test('Supabase failures become a generic 503 and never expose the service-role secret', async () => {
  const storage = makeStorage({
    async upload() {
      throw new UpstreamUnavailableError(`Supabase failed with ${SECRET}`);
    },
  });
  const { handle, logs } = setup({ storage });

  const res = await handle(uploadRequest());
  assert.equal(res.status, 503);
  const text = await res.text();
  assert.ok(!text.includes(SECRET));
  assert.match(text, /temporarily unavailable/i);
  assert.ok(logs.length > 0);
  assert.ok(logs.every((line) => !line.includes(SECRET)));
});

test('a storage object conflict becomes a safe 409', async () => {
  const storage = makeStorage({
    async upload() {
      throw new StorageConflictError();
    },
  });
  const { handle } = setup({ storage });

  const res = await handle(uploadRequest());
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.code, 'image_object_conflict');
  assert.ok(!JSON.stringify(body).includes(SECRET));
});

test('CORS preflight from the production Vercel origin permits DELETE and image headers', async () => {
  const { handle } = setup();
  const res = await handle(
    new Request('https://api.test/api/images', {
      method: 'OPTIONS',
      headers: {
        Origin: VERCEL_ORIGIN,
        'Access-Control-Request-Method': 'DELETE',
        'Access-Control-Request-Headers':
          'authorization,content-type,x-image-kind,x-original-filename,x-restaurant-id',
      },
    })
  );

  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
  assert.match(res.headers.get('access-control-allow-methods') || '', /DELETE/);
  for (const header of [
    'authorization',
    'content-type',
    'x-image-kind',
    'x-original-filename',
    'x-restaurant-id',
  ]) {
    assert.match(
      (res.headers.get('access-control-allow-headers') || '').toLowerCase(),
      new RegExp(header.toLowerCase())
    );
  }
});

test('a DELETE request from the production Vercel origin receives CORS headers', async () => {
  const path = `products/${RESTAURANT_ID}/${OBJECT_ID}.png`;
  const { handle } = setup({
    docs: {
      'products/prod-1': {
        restaurantId: RESTAURANT_ID,
        image: 'https://supabase.test/storage/v1/object/public/restaurant-assets/old.png',
      },
    },
  });

  const res = await handle(
    jsonRequest(
      '/api/images',
      {
        kind: IMAGE_KINDS.PRODUCT,
        path,
        restaurantId: RESTAURANT_ID,
        resourceId: 'prod-1',
        reason: 'orphan-cleanup',
      },
      { token: 'owner-token', method: 'DELETE' }
    )
  );

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
  assert.equal(res.headers.get('vary'), 'Origin');
});
