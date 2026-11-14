// Cloudflare Worker image API.
//
// Public restaurant assets and private customer profile images are stored in
// separate Supabase buckets. Every route authenticates with the existing
// Firebase token verifier, derives identity from the verified token, and
// authorizes management against authoritative Firestore documents.
//
// Public assets are never deleted as part of replacement. A public delete is a
// separate, explicit operation and is refused while the object is still the
// current Firestore reference.

'use strict';

import {
  ImageAuthorizationError,
  getDocumentData,
  requireRegisteredProfile,
  requireRestaurantManager,
} from './imageAuthorization.js';
import {
  ImageValidationError,
  IMAGE_KINDS,
  MAX_IMAGE_BYTES,
  SIGNED_URL_TTL_SECONDS,
  STORAGE_BUCKETS,
  buildImageObjectPath,
  getStorageBucket,
  isPublicImageKind,
  parseProfileObjectPath,
  parsePublicObjectPath,
  validateImageBytes,
  validateSafeSegment,
  validateUploadMetadata,
} from './imageValidation.js';
import { UpstreamUnavailableError } from './errors.js';

const MAX_JSON_BYTES = 16 * 1024;

export class ImageRequestError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ImageRequestError';
    this.code = code;
    this.status = status;
  }
}

function requestError(error) {
  if (
    error instanceof ImageRequestError ||
    error instanceof ImageValidationError ||
    error instanceof ImageAuthorizationError
  ) {
    return error;
  }
  return null;
}

async function readJsonBody(request) {
  const raw = await request.text().catch(() => '');
  if (raw.length > MAX_JSON_BYTES) {
    throw new ImageRequestError(
      'image_request_too_large',
      'The image request is too large.',
      413
    );
  }
  if (!raw) return {};
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ImageRequestError(
      'image_request_invalid',
      'The image request could not be processed.'
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ImageRequestError(
      'image_request_invalid',
      'The image request could not be processed.'
    );
  }
  return value;
}

function referenceMatchesPath(reference, path, storage) {
  const current = String(reference || '').trim();
  if (!current) return false;
  if (current === path) return true;
  try {
    return current === storage.publicUrl(STORAGE_BUCKETS.RESTAURANT_ASSETS, path);
  } catch {
    return false;
  }
}

function requireString(value, code, message) {
  const text = String(value || '').trim();
  if (!text) throw new ImageRequestError(code, message);
  return text;
}

/**
 * Build the image service around the Supabase adapter and Firestore adapter.
 */
export function createImageApi({
  db,
  storage,
  randomUUID = () => crypto.randomUUID(),
  now = () => Date.now(),
} = {}) {
  if (!db) throw new Error('createImageApi requires a Firestore adapter.');
  if (!storage) throw new Error('createImageApi requires a Supabase storage adapter.');

  async function bestEffortCleanup(bucket, path) {
    try {
      await storage.remove(bucket, path);
    } catch {
      // The original upload failure is more useful to the caller. A later,
      // conservative orphan sweep can remove an object whose cleanup response
      // was lost.
    }
  }

  async function upload({ request, auth }) {
    const metadata = validateUploadMetadata({
      kind: request.headers.get('X-Image-Kind'),
      restaurantId: request.headers.get('X-Restaurant-Id'),
      originalFilename: request.headers.get('X-Original-Filename'),
      contentType: request.headers.get('Content-Type'),
      contentLength: request.headers.get('Content-Length'),
    });

    if (metadata.kind === IMAGE_KINDS.CUSTOMER_PROFILE) {
      await requireRegisteredProfile(db, auth.uid);
    } else {
      await requireRestaurantManager(db, auth.uid, metadata.restaurantId);
    }

    let body;
    try {
      body = await request.arrayBuffer();
    } catch {
      throw new ImageRequestError(
        'image_body_unreadable',
        'The uploaded image could not be read.'
      );
    }
    const bytes = validateImageBytes(body, metadata.contentType);

    const path = buildImageObjectPath({
      kind: metadata.kind,
      ownerUid: auth.uid,
      restaurantId: metadata.restaurantId,
      extension: metadata.extension,
      objectId: randomUUID(),
    });
    const bucket = getStorageBucket(metadata.kind);

    try {
      await storage.upload(bucket, path, bytes, metadata.contentType);
    } catch (error) {
      // Only an ambiguous transport outcome (timeout/network failure) can mean
      // Supabase accepted the bytes before the response was lost. In that
      // case the generated path is known, so make a bounded best-effort
      // cleanup. A definitive 4xx/409 did not create this object and must
      // never delete a pre-existing object that happens to share the path.
      // No Firestore reference is created here in any case.
      if (
        error instanceof UpstreamUnavailableError &&
        error.cleanupMayHaveSucceeded
      ) {
        await bestEffortCleanup(bucket, path);
      }
      throw error;
    }

    if (metadata.kind === IMAGE_KINDS.CUSTOMER_PROFILE) {
      return {
        success: true,
        bucket,
        objectPath: path,
        reference: path,
        url: null,
        contentType: metadata.contentType,
      };
    }

    const url = storage.publicUrl(bucket, path);
    return {
      success: true,
      bucket,
      objectPath: path,
      reference: url,
      url,
      contentType: metadata.contentType,
    };
  }

  async function signedUrl({ request, auth }) {
    const body = await readJsonBody(request);
    const parsed = parseProfileObjectPath(
      requireString(
        body.path,
        'image_path_missing',
        'The profile image path is required.'
      )
    );
    if (parsed.uid !== auth.uid) {
      throw new ImageAuthorizationError(
        'image_profile_forbidden',
        'You are not authorized to access this profile image.'
      );
    }
    await requireRegisteredProfile(db, auth.uid);

    const expiresIn = SIGNED_URL_TTL_SECONDS;
    const url = await storage.createSignedUrl(
      STORAGE_BUCKETS.PROFILE_IMAGES,
      parsed.path,
      expiresIn
    );
    return {
      success: true,
      path: parsed.path,
      url,
      expiresAt: new Date(now() + expiresIn * 1000).toISOString(),
    };
  }

  async function assertPublicTargetNotCurrent({
    kind,
    path,
    restaurantId,
    resourceId,
  }) {
    let field = null;
    let documentPath = null;
    let document = null;

    if (kind === IMAGE_KINDS.PRODUCT) {
      field = 'image';
      documentPath = `products/${resourceId}`;
      document = await getDocumentData(db, documentPath);
      if (document && document.restaurantId && document.restaurantId !== restaurantId) {
        throw new ImageAuthorizationError(
          'image_resource_forbidden',
          'The image resource belongs to another restaurant.'
        );
      }
    } else if (
      kind === IMAGE_KINDS.RESTAURANT_LOGO ||
      kind === IMAGE_KINDS.RESTAURANT_COVER
    ) {
      field = kind === IMAGE_KINDS.RESTAURANT_LOGO ? 'logo' : 'coverImage';
      documentPath = `restaurants/${restaurantId}`;
      document = await getDocumentData(db, documentPath);
    } else if (kind === IMAGE_KINDS.CATEGORY) {
      field = 'image';
      documentPath = `restaurants/${restaurantId}/categories/${resourceId}`;
      document = await getDocumentData(db, documentPath);
      if (document && document.restaurantId && document.restaurantId !== restaurantId) {
        throw new ImageAuthorizationError(
          'image_resource_forbidden',
          'The image resource belongs to another restaurant.'
        );
      }
    }

    if (document && referenceMatchesPath(document[field], path, storage)) {
      throw new ImageRequestError(
        'image_reference_in_use',
        'The image is still the current reference and cannot be deleted.',
        409
      );
    }
  }

  async function assertProfileTargetNotCurrent({ uid, path }) {
    const profile = await getDocumentData(db, `users/${uid}`);
    if (!profile) return;
    if (referenceMatchesPath(profile.photoPath, path, storage)) {
      throw new ImageRequestError(
        'image_reference_in_use',
        'The image is still the current reference and cannot be deleted.',
        409
      );
    }
  }

  async function remove({ request, auth }) {
    const body = await readJsonBody(request);
    const kind = requireString(
      body.kind,
      'image_kind_missing',
      'The image kind is required.'
    );
    const path = requireString(
      body.path,
      'image_path_missing',
      'The image path is required.'
    );
    const reason = requireString(
      body.reason,
      'image_delete_reason_missing',
      'The image deletion reason is required.'
    );

    if (kind === IMAGE_KINDS.CUSTOMER_PROFILE) {
      const parsed = parseProfileObjectPath(path);
      if (parsed.uid !== auth.uid) {
        throw new ImageAuthorizationError(
          'image_profile_forbidden',
          'You are not authorized to delete this profile image.'
        );
      }
      await requireRegisteredProfile(db, auth.uid);
      if (!['profile-replace', 'profile-remove', 'account-delete'].includes(reason)) {
        throw new ImageRequestError(
          'image_delete_reason_invalid',
          'The profile image deletion reason is invalid.'
        );
      }
      // Even profile cleanup is refused while Firestore still points at the
      // object. This prevents two concurrent replacements from deleting the
      // image that the later Firestore write made current.
      await assertProfileTargetNotCurrent({ uid: auth.uid, path: parsed.path });
      const deleted = await storage.remove(STORAGE_BUCKETS.PROFILE_IMAGES, parsed.path);
      return { success: true, deleted: Boolean(deleted), path: parsed.path };
    }

    if (!isPublicImageKind(kind)) {
      throw new ImageRequestError('image_kind_invalid', 'The image kind is invalid.');
    }
    const restaurantId = requireString(
      body.restaurantId,
      'image_restaurant_missing',
      'The restaurant id is required.'
    );
    const resourceId = validateSafeSegment(
      requireString(
        body.resourceId,
        'image_resource_missing',
        'The image resource id is required.'
      ),
      'Resource id'
    );
    if (!['orphan-cleanup', 'resource-delete'].includes(reason)) {
      throw new ImageRequestError(
        'image_delete_reason_invalid',
        'Public image deletion requires an explicit cleanup reason.'
      );
    }

    const parsed = parsePublicObjectPath(kind, path, restaurantId);
    await requireRestaurantManager(db, auth.uid, restaurantId);
    await assertPublicTargetNotCurrent({
      kind,
      path: parsed.path,
      restaurantId,
      resourceId,
    });

    const deleted = await storage.remove(
      STORAGE_BUCKETS.RESTAURANT_ASSETS,
      parsed.path
    );
    return { success: true, deleted: Boolean(deleted), path: parsed.path };
  }

  return { upload, signedUrl, remove };
}

export { MAX_IMAGE_BYTES, requestError, UpstreamUnavailableError };
