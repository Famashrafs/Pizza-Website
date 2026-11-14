// Strict image upload validation and canonical Supabase object-path rules.
//
// The Worker never accepts a client-supplied storage path. It validates the
// upload metadata and bytes, then generates a path from authenticated context
// (Firebase uid + authorized restaurant id) and a server-generated UUID.

'use strict';

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

export const IMAGE_KINDS = Object.freeze({
  PRODUCT: 'product',
  RESTAURANT_LOGO: 'restaurantLogo',
  RESTAURANT_COVER: 'restaurantCover',
  CATEGORY: 'category',
  CUSTOMER_PROFILE: 'customerProfile',
});

export const STORAGE_BUCKETS = Object.freeze({
  RESTAURANT_ASSETS: 'restaurant-assets',
  PROFILE_IMAGES: 'profile-images',
});

const TYPE_CONFIG = Object.freeze({
  'image/png': Object.freeze({ extension: 'png', allowedExtensions: ['png'] }),
  'image/jpeg': Object.freeze({ extension: 'jpg', allowedExtensions: ['jpg', 'jpeg'] }),
  'image/webp': Object.freeze({ extension: 'webp', allowedExtensions: ['webp'] }),
  'image/gif': Object.freeze({ extension: 'gif', allowedExtensions: ['gif'] }),
});

const PUBLIC_KINDS = new Set([
  IMAGE_KINDS.PRODUCT,
  IMAGE_KINDS.RESTAURANT_LOGO,
  IMAGE_KINDS.RESTAURANT_COVER,
  IMAGE_KINDS.CATEGORY,
]);

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_FILE = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(png|jpg|webp|gif)';

export class ImageValidationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ImageValidationError';
    this.code = code;
    this.status = status;
  }
}

function invalid(code, message, status = 400) {
  throw new ImageValidationError(code, message, status);
}

export function isPublicImageKind(kind) {
  return PUBLIC_KINDS.has(kind);
}

export function getStorageBucket(kind) {
  return kind === IMAGE_KINDS.CUSTOMER_PROFILE
    ? STORAGE_BUCKETS.PROFILE_IMAGES
    : STORAGE_BUCKETS.RESTAURANT_ASSETS;
}

export function normalizeImageKind(value) {
  const kind = String(value || '').trim();
  if (!Object.values(IMAGE_KINDS).includes(kind)) {
    invalid('image_kind_invalid', 'The image kind is invalid.');
  }
  return kind;
}

export function validateSafeSegment(value, label) {
  const segment = String(value || '').trim();
  if (!SAFE_SEGMENT.test(segment)) {
    invalid('image_path_segment_invalid', `${label} is invalid.`);
  }
  return segment;
}

function decodeOriginalFilename(value) {
  const raw = String(value || '').trim();
  if (!raw) invalid('image_filename_missing', 'The original image filename is required.');
  if (raw.length > 512) invalid('image_filename_invalid', 'The original image filename is invalid.');

  let decoded = raw;
  if (raw.includes('%')) {
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      invalid('image_filename_invalid', 'The original image filename is invalid.');
    }
  }

  // Reject rather than silently sanitise traversal or path separators. The
  // original name is never used as a storage path, but accepting it here would
  // still create an ambiguous audit trail.
  if (
    decoded === '.' ||
    decoded === '..' ||
    decoded.includes('/') ||
    decoded.includes('\\') ||
    decoded.includes('\0') ||
    /[\u0000-\u001f\u007f]/.test(decoded)
  ) {
    invalid('image_filename_invalid', 'The original image filename is invalid.');
  }
  return decoded;
}

function extensionOf(filename) {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) {
    invalid('image_extension_invalid', 'The image filename must have a valid extension.');
  }
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * Validate upload metadata before the request body is read.
 */
export function validateUploadMetadata({
  kind,
  restaurantId,
  originalFilename,
  contentType,
  contentLength,
} = {}) {
  const normalizedKind = normalizeImageKind(kind);
  const normalizedType = String(contentType || '').trim().toLowerCase();
  const type = TYPE_CONFIG[normalizedType];
  if (!type) {
    invalid('image_mime_invalid', 'Images must be PNG, JPG, WEBP or GIF.', 415);
  }

  const filename = decodeOriginalFilename(originalFilename);
  const extension = extensionOf(filename);
  if (!type.allowedExtensions.includes(extension)) {
    invalid(
      'image_extension_mismatch',
      'The image filename extension does not match its MIME type.',
      415
    );
  }

  let normalizedRestaurantId = '';
  if (isPublicImageKind(normalizedKind)) {
    normalizedRestaurantId = validateSafeSegment(restaurantId, 'Restaurant id');
  } else if (String(restaurantId || '').trim()) {
    invalid('image_restaurant_not_allowed', 'A restaurant id is not valid for this image kind.');
  }

  if (contentLength != null && contentLength !== '') {
    const length = Number(contentLength);
    if (!Number.isFinite(length) || length < 0) {
      invalid('image_content_length_invalid', 'The image content length is invalid.');
    }
    if (length > MAX_IMAGE_BYTES) {
      invalid('image_too_large', 'The image is larger than the 4 MB limit.', 413);
    }
  }

  return {
    kind: normalizedKind,
    restaurantId: normalizedRestaurantId,
    originalFilename: filename,
    contentType: normalizedType,
    extension: type.extension,
  };
}

function startsWithBytes(bytes, expected, offset = 0) {
  if (bytes.length < offset + expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected[index]) return false;
  }
  return true;
}

function ascii(bytes, start, end) {
  let value = '';
  for (let index = start; index < end && index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

/**
 * Validate the actual bytes, not only the declared Content-Type. This rejects
 * SVG, text masquerading as PNG, truncated headers, and other malformed data.
 */
export function validateImageBytes(bytes, contentType) {
  if (!bytes || typeof bytes.byteLength !== 'number' || bytes.byteLength === 0) {
    invalid('image_empty', 'The uploaded image is empty.');
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    invalid('image_too_large', 'The image is larger than the 4 MB limit.', 413);
  }

  const view = bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);

  const type = String(contentType || '').toLowerCase();
  let valid = false;

  if (type === 'image/png') {
    valid = startsWithBytes(view, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  } else if (type === 'image/jpeg') {
    valid = startsWithBytes(view, [0xff, 0xd8, 0xff]);
  } else if (type === 'image/gif') {
    const header = ascii(view, 0, 6);
    valid = header === 'GIF87a' || header === 'GIF89a';
  } else if (type === 'image/webp') {
    valid =
      ascii(view, 0, 4) === 'RIFF' &&
      ascii(view, 8, 12) === 'WEBP' &&
      view.length >= 12;
  }

  if (!valid) {
    invalid('image_content_invalid', 'The uploaded file is not a valid image.', 415);
  }
  return view;
}

/**
 * Build a canonical object path from authenticated context only.
 */
export function buildImageObjectPath({
  kind,
  ownerUid,
  restaurantId,
  extension,
  objectId,
} = {}) {
  const normalizedKind = normalizeImageKind(kind);
  const uid = validateSafeSegment(ownerUid, 'User uid');
  const id = String(objectId || '').toLowerCase();
  if (!UUID.test(id)) invalid('image_object_id_invalid', 'The image object id is invalid.');

  const ext = String(extension || '').toLowerCase();
  if (!['png', 'jpg', 'webp', 'gif'].includes(ext)) {
    invalid('image_extension_invalid', 'The image extension is invalid.');
  }

  if (normalizedKind === IMAGE_KINDS.PRODUCT) {
    const restaurant = validateSafeSegment(restaurantId, 'Restaurant id');
    return `products/${restaurant}/${id}.${ext}`;
  }
  if (normalizedKind === IMAGE_KINDS.RESTAURANT_LOGO) {
    const restaurant = validateSafeSegment(restaurantId, 'Restaurant id');
    return `branding/${restaurant}/logo/${id}.${ext}`;
  }
  if (normalizedKind === IMAGE_KINDS.RESTAURANT_COVER) {
    const restaurant = validateSafeSegment(restaurantId, 'Restaurant id');
    return `branding/${restaurant}/cover/${id}.${ext}`;
  }
  if (normalizedKind === IMAGE_KINDS.CATEGORY) {
    const restaurant = validateSafeSegment(restaurantId, 'Restaurant id');
    return `categories/${restaurant}/${id}.${ext}`;
  }
  if (normalizedKind === IMAGE_KINDS.CUSTOMER_PROFILE) {
    return `users/${uid}/profile/${id}.${ext}`;
  }

  invalid('image_kind_invalid', 'The image kind is invalid.');
}

/**
 * Parse and validate a canonical profile path. The returned uid is always
 * compared with the verified token uid by the caller.
 */
export function parseProfileObjectPath(path) {
  const value = String(path || '');
  const match = value.match(
    /^users\/([A-Za-z0-9_-]{1,128})\/profile\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp|gif))$/i
  );
  if (!match) invalid('image_path_invalid', 'The image path is invalid.');
  return { uid: match[1], path: value, extension: match[3].toLowerCase() };
}

/**
 * Parse and validate a canonical public path for a known image kind.
 */
export function parsePublicObjectPath(kind, path, restaurantId) {
  const normalizedKind = normalizeImageKind(kind);
  if (!isPublicImageKind(normalizedKind)) {
    invalid('image_path_invalid', 'The image path is invalid.');
  }
  const restaurant = validateSafeSegment(restaurantId, 'Restaurant id');
  const value = String(path || '');

  const patterns = {
    [IMAGE_KINDS.PRODUCT]: new RegExp(
      `^products/${restaurant}/${OBJECT_FILE}$`,
      'i'
    ),
    [IMAGE_KINDS.RESTAURANT_LOGO]: new RegExp(
      `^branding/${restaurant}/logo/${OBJECT_FILE}$`,
      'i'
    ),
    [IMAGE_KINDS.RESTAURANT_COVER]: new RegExp(
      `^branding/${restaurant}/cover/${OBJECT_FILE}$`,
      'i'
    ),
    [IMAGE_KINDS.CATEGORY]: new RegExp(
      `^categories/${restaurant}/${OBJECT_FILE}$`,
      'i'
    ),
  };

  if (!patterns[normalizedKind].test(value)) {
    invalid('image_path_invalid', 'The image path is invalid.');
  }
  return { path: value, restaurantId: restaurant };
}

export { TYPE_CONFIG as IMAGE_TYPE_CONFIG };
