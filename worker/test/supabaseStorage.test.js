// Supabase Storage REST adapter tests: configuration, credential handling,
// path encoding, upstream failures, and bounded timeouts.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSupabaseStorage,
  DEFAULT_TIMEOUT_MS,
} from '../src/supabaseStorage.js';
import { STORAGE_BUCKETS } from '../src/imageValidation.js';
import {
  StorageConflictError,
  UpstreamUnavailableError,
} from '../src/errors.js';

const SERVICE_KEY = 'service-role-secret-value-that-must-not-leak';
const BASE_URL = 'https://supabase.test';

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test('configuration requires a URL and a service-role key', () => {
  assert.throws(
    () => createSupabaseStorage({ serviceRoleKey: SERVICE_KEY }),
    /SUPABASE_URL is required/
  );
  assert.throws(
    () => createSupabaseStorage({ url: BASE_URL, serviceRoleKey: '' }),
    /SUPABASE_SERVICE_ROLE_KEY is required/
  );
});

test('remote Supabase URLs must use https; loopback HTTP is allowed for local development', () => {
  assert.throws(
    () =>
      createSupabaseStorage({
        url: 'http://supabase.test',
        serviceRoleKey: SERVICE_KEY,
      }),
    /must use https for a remote host/
  );

  assert.doesNotThrow(() =>
    createSupabaseStorage({
      url: 'http://127.0.0.1:54321',
      serviceRoleKey: SERVICE_KEY,
    })
  );
});

test('the service-role credential is sent only as a header and never enters a URL', async () => {
  let seen = null;
  const storage = createSupabaseStorage({
    url: BASE_URL,
    serviceRoleKey: SERVICE_KEY,
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return response(200, { Id: 'object-1' });
    },
  });

  const bytes = new Uint8Array([1, 2, 3]);
  const result = await storage.upload(
    STORAGE_BUCKETS.RESTAURANT_ASSETS,
    'products/restaurant-1/image.png',
    bytes,
    'image/png'
  );

  assert.equal(result.id, 'object-1');
  assert.ok(!seen.url.includes(SERVICE_KEY));
  assert.equal(seen.options.headers.apikey, SERVICE_KEY);
  assert.equal(seen.options.headers.Authorization, `Bearer ${SERVICE_KEY}`);
  assert.equal(seen.options.headers['x-upsert'], 'false');
  assert.equal(seen.options.headers['Content-Type'], 'image/png');
  assert.equal(seen.options.body, bytes);
  assert.equal(seen.options.method, 'POST');
});

test('public URLs encode object segments and private profile URLs are refused', () => {
  const storage = createSupabaseStorage({
    url: BASE_URL,
    serviceRoleKey: SERVICE_KEY,
  });

  assert.equal(
    storage.publicUrl(
      STORAGE_BUCKETS.RESTAURANT_ASSETS,
      'products/restaurant one/image name.png'
    ),
    `${BASE_URL}/storage/v1/object/public/restaurant-assets/products/restaurant%20one/image%20name.png`
  );

  assert.throws(
    () =>
      storage.publicUrl(
        STORAGE_BUCKETS.PROFILE_IMAGES,
        'users/customer-1/profile/image.png'
      ),
    (err) =>
      err.name === 'ConfigurationError' &&
      err.code === 'private_bucket_public_url_forbidden'
  );
});

test('an upload conflict is a 409 and does not expose the upstream response body', async () => {
  const storage = createSupabaseStorage({
    url: BASE_URL,
    serviceRoleKey: SERVICE_KEY,
    fetchImpl: async () =>
      response(409, { message: `sensitive ${SERVICE_KEY} upstream detail` }),
  });

  await assert.rejects(
    () =>
      storage.upload(
        STORAGE_BUCKETS.PROFILE_IMAGES,
        'users/customer-1/profile/image.png',
        new Uint8Array([1]),
        'image/png'
      ),
    (err) => {
      assert.equal(err.name, 'StorageConflictError');
      assert.equal(err.status, 409);
      assert.ok(!err.message.includes(SERVICE_KEY));
      return true;
    }
  );
});

test('upstream HTTP failures are sanitized and never include the response body', async () => {
  const storage = createSupabaseStorage({
    url: BASE_URL,
    serviceRoleKey: SERVICE_KEY,
    fetchImpl: async () =>
      response(500, { message: `internal ${SERVICE_KEY} detail` }),
  });

  await assert.rejects(
    () =>
      storage.upload(
        STORAGE_BUCKETS.PROFILE_IMAGES,
        'users/customer-1/profile/image.png',
        new Uint8Array([1]),
        'image/png'
      ),
    (err) => {
      assert.equal(err.name, 'UpstreamUnavailableError');
      assert.equal(err.status, 503);
      assert.equal(err.cleanupMayHaveSucceeded, true);
      assert.ok(!err.message.includes(SERVICE_KEY));
      assert.ok(!err.message.includes('internal'));
      return true;
    }
  );
});

test('network failures and timeouts become bounded upstream-unavailable errors', async () => {
  const networkFailure = createSupabaseStorage({
    url: BASE_URL,
    serviceRoleKey: SERVICE_KEY,
    fetchImpl: async () => {
      throw new Error(`network failed with ${SERVICE_KEY}`);
    },
  });

  await assert.rejects(
    () =>
      networkFailure.remove(
        STORAGE_BUCKETS.PROFILE_IMAGES,
        'users/customer-1/profile/image.png'
      ),
    (err) => {
      assert.equal(err.name, 'UpstreamUnavailableError');
      assert.equal(err.code, 'supabase_unreachable');
      assert.ok(!err.message.includes(SERVICE_KEY));
      return true;
    }
  );

  const timedOut = createSupabaseStorage({
    url: BASE_URL,
    serviceRoleKey: SERVICE_KEY,
    timeoutMs: 5,
    fetchImpl: () => new Promise(() => {}),
  });

  const started = Date.now();
  await assert.rejects(
    () =>
      timedOut.upload(
        STORAGE_BUCKETS.PROFILE_IMAGES,
        'users/customer-1/profile/image.png',
        new Uint8Array([1]),
        'image/png'
      ),
    (err) => {
      assert.equal(err.name, 'UpstreamUnavailableError');
      assert.equal(err.code, 'supabase_timeout');
      assert.equal(err.cleanupMayHaveSucceeded, true);
      return true;
    }
  );
  assert.ok(Date.now() - started < 1000, 'the timeout must be bounded');
});

test('delete reports a missing object without treating it as an upstream failure', async () => {
  const storage = createSupabaseStorage({
    url: BASE_URL,
    serviceRoleKey: SERVICE_KEY,
    fetchImpl: async () => response(404),
  });

  assert.equal(
    await storage.remove(
      STORAGE_BUCKETS.PROFILE_IMAGES,
      'users/customer-1/profile/missing.png'
    ),
    false
  );
});

test('signed URLs accept Supabase relative and same-origin absolute forms', async () => {
  let relative = createSupabaseStorage({
    url: BASE_URL,
    serviceRoleKey: SERVICE_KEY,
    fetchImpl: async () =>
      response(200, {
        signedURL: `/object/sign/${STORAGE_BUCKETS.PROFILE_IMAGES}/users/customer-1/profile/image.png?token=abc`,
      }),
  });

  const relativeUrl = await relative.createSignedUrl(
    STORAGE_BUCKETS.PROFILE_IMAGES,
    'users/customer-1/profile/image.png',
    300
  );
  assert.equal(
    relativeUrl,
    `${BASE_URL}/storage/v1/object/sign/${STORAGE_BUCKETS.PROFILE_IMAGES}/users/customer-1/profile/image.png?token=abc`
  );

  const absolute = createSupabaseStorage({
    url: BASE_URL,
    serviceRoleKey: SERVICE_KEY,
    fetchImpl: async () =>
      response(200, {
        signedURL: `${BASE_URL}/storage/v1/object/sign/${STORAGE_BUCKETS.PROFILE_IMAGES}/users/customer-1/profile/image.png?token=abc`,
      }),
  });
  const absoluteUrl = await absolute.createSignedUrl(
    STORAGE_BUCKETS.PROFILE_IMAGES,
    'users/customer-1/profile/image.png',
    300
  );
  assert.match(absoluteUrl, /^https:\/\/supabase\.test\/storage\/v1\/object\/sign\//);
});

test('a signed URL from a different origin is rejected', async () => {
  const storage = createSupabaseStorage({
    url: BASE_URL,
    serviceRoleKey: SERVICE_KEY,
    fetchImpl: async () =>
      response(200, {
        signedURL: 'https://evil.example/storage/v1/object/sign/profile-images/secret?token=abc',
      }),
  });

  await assert.rejects(
    () =>
      storage.createSignedUrl(
        STORAGE_BUCKETS.PROFILE_IMAGES,
        'users/customer-1/profile/image.png',
        300
      ),
    (err) => err.name === 'UpstreamUnavailableError'
  );
});

test('the adapter default timeout is finite', () => {
  assert.equal(typeof DEFAULT_TIMEOUT_MS, 'number');
  assert.ok(DEFAULT_TIMEOUT_MS > 0 && DEFAULT_TIMEOUT_MS <= 60_000);
});
