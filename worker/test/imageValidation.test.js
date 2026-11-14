// Strict upload/path validation tests for the Worker image service.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMAGE_KINDS,
  MAX_IMAGE_BYTES,
  STORAGE_BUCKETS,
  buildImageObjectPath,
  getStorageBucket,
  parseProfileObjectPath,
  parsePublicObjectPath,
  validateImageBytes,
  validateSafeSegment,
  validateUploadMetadata,
} from '../src/imageValidation.js';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
]);
const OBJECT_ID = '123e4567-e89b-42d3-a456-426614174000';

function validationFailure(code, status) {
  return (err) => {
    assert.equal(err.name, 'ImageValidationError');
    assert.equal(err.code, code);
    if (status != null) assert.equal(err.status, status);
    return true;
  };
}

test('upload metadata accepts supported image types and canonicalizes JPEG to jpg', () => {
  assert.deepEqual(
    validateUploadMetadata({
      kind: IMAGE_KINDS.PRODUCT,
      restaurantId: 'restaurant-pizza-demo',
      originalFilename: 'Pizza.JPG',
      contentType: 'IMAGE/JPEG',
      contentLength: '123',
    }),
    {
      kind: 'product',
      restaurantId: 'restaurant-pizza-demo',
      originalFilename: 'Pizza.JPG',
      contentType: 'image/jpeg',
      extension: 'jpg',
    }
  );

  assert.deepEqual(
    validateUploadMetadata({
      kind: IMAGE_KINDS.CUSTOMER_PROFILE,
      originalFilename: 'avatar.png',
      contentType: 'image/png',
    }),
    {
      kind: 'customerProfile',
      restaurantId: '',
      originalFilename: 'avatar.png',
      contentType: 'image/png',
      extension: 'png',
    }
  );
});

test('unsupported MIME types such as SVG are rejected with 415', () => {
  assert.throws(
    () =>
      validateUploadMetadata({
        kind: IMAGE_KINDS.PRODUCT,
        restaurantId: 'restaurant-pizza-demo',
        originalFilename: 'logo.svg',
        contentType: 'image/svg+xml',
      }),
    validationFailure('image_mime_invalid', 415)
  );
});

test('the filename extension must match the declared MIME type', () => {
  assert.throws(
    () =>
      validateUploadMetadata({
        kind: IMAGE_KINDS.PRODUCT,
        restaurantId: 'restaurant-pizza-demo',
        originalFilename: 'photo.png',
        contentType: 'image/jpeg',
      }),
    validationFailure('image_extension_mismatch', 415)
  );
});

test('declared and actual file sizes above 4 MiB are rejected with 413', () => {
  assert.throws(
    () =>
      validateUploadMetadata({
        kind: IMAGE_KINDS.PRODUCT,
        restaurantId: 'restaurant-pizza-demo',
        originalFilename: 'large.png',
        contentType: 'image/png',
        contentLength: MAX_IMAGE_BYTES + 1,
      }),
    validationFailure('image_too_large', 413)
  );

  assert.throws(
    () => validateImageBytes(new Uint8Array(MAX_IMAGE_BYTES + 1), 'image/png'),
    validationFailure('image_too_large', 413)
  );
});

test('empty and malformed image bytes are rejected', () => {
  assert.throws(
    () => validateImageBytes(new Uint8Array(), 'image/png'),
    validationFailure('image_empty', 400)
  );

  for (const [bytes, type] of [
    [new TextEncoder().encode('<svg onload=alert(1)>'), 'image/png'],
    [new TextEncoder().encode('not-an-image'), 'image/jpeg'],
    [new Uint8Array([0x47, 0x49, 0x46, 0x38]), 'image/gif'],
    [new TextEncoder().encode('RIFFxxxxNOPE'), 'image/webp'],
  ]) {
    assert.throws(
      () => validateImageBytes(bytes, type),
      validationFailure('image_content_invalid', 415)
    );
  }
});

test('supported magic-byte signatures are accepted', () => {
  assert.ok(validateImageBytes(PNG, 'image/png') instanceof Uint8Array);
  assert.ok(validateImageBytes(JPEG, 'image/jpeg') instanceof Uint8Array);
  assert.ok(validateImageBytes(GIF, 'image/gif') instanceof Uint8Array);
  assert.ok(validateImageBytes(WEBP, 'image/webp') instanceof Uint8Array);
});

test('traversal and separator characters in the original filename are rejected', () => {
  for (const filename of [
    '../secret.png',
    '..\\secret.png',
    '%2e%2e%2fsecret.png',
    'folder/image.png',
    '..',
    'image.png\u0000.txt',
  ]) {
    assert.throws(
      () =>
        validateUploadMetadata({
          kind: IMAGE_KINDS.CUSTOMER_PROFILE,
          originalFilename: filename,
          contentType: 'image/png',
        }),
      validationFailure('image_filename_invalid', 400),
      filename
    );
  }
});

test('path segments and generated object paths cannot contain traversal segments', () => {
  assert.throws(
    () => validateSafeSegment('../users', 'Restaurant id'),
    validationFailure('image_path_segment_invalid', 400)
  );
  assert.throws(
    () => validateSafeSegment('a/b', 'Restaurant id'),
    validationFailure('image_path_segment_invalid', 400)
  );

  assert.equal(
    buildImageObjectPath({
      kind: IMAGE_KINDS.PRODUCT,
      ownerUid: 'owner-1',
      restaurantId: 'restaurant-pizza-demo',
      extension: 'png',
      objectId: OBJECT_ID,
    }),
    `products/restaurant-pizza-demo/${OBJECT_ID}.png`
  );
  assert.equal(
    buildImageObjectPath({
      kind: IMAGE_KINDS.CUSTOMER_PROFILE,
      ownerUid: 'customer-1',
      extension: 'jpg',
      objectId: OBJECT_ID,
    }),
    `users/customer-1/profile/${OBJECT_ID}.jpg`
  );
});

test('public and profile path parsers accept only canonical server-generated paths', () => {
  assert.deepEqual(
    parseProfileObjectPath(`users/customer-1/profile/${OBJECT_ID}.png`),
    {
      uid: 'customer-1',
      path: `users/customer-1/profile/${OBJECT_ID}.png`,
      extension: 'png',
    }
  );

  assert.deepEqual(
    parsePublicObjectPath(
      IMAGE_KINDS.PRODUCT,
      `products/restaurant-pizza-demo/${OBJECT_ID}.webp`,
      'restaurant-pizza-demo'
    ),
    {
      path: `products/restaurant-pizza-demo/${OBJECT_ID}.webp`,
      restaurantId: 'restaurant-pizza-demo',
    }
  );

  for (const path of [
    `users/customer-1/profile/${OBJECT_ID}.png/../../secret`,
    `users/customer-1/profile/not-a-uuid.png`,
    '../profile.png',
    `users/customer-1/profile/${OBJECT_ID}.svg`,
  ]) {
    assert.throws(
      () => parseProfileObjectPath(path),
      validationFailure('image_path_invalid', 400),
      path
    );
  }

  assert.throws(
    () =>
      parsePublicObjectPath(
        IMAGE_KINDS.PRODUCT,
        `products/other-restaurant/${OBJECT_ID}.png`,
        'restaurant-pizza-demo'
      ),
    validationFailure('image_path_invalid', 400)
  );
});

test('profile images and public restaurant assets use separate buckets', () => {
  assert.equal(
    getStorageBucket(IMAGE_KINDS.CUSTOMER_PROFILE),
    STORAGE_BUCKETS.PROFILE_IMAGES
  );
  assert.equal(
    getStorageBucket(IMAGE_KINDS.PRODUCT),
    STORAGE_BUCKETS.RESTAURANT_ASSETS
  );
});
