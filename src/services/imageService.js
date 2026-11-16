// Authenticated image access through the Cloudflare Worker Supabase API.
//
// The browser never receives a Supabase key and never uploads bytes directly
// to Supabase. It sends the image to the Worker with the current Firebase ID
// token; the Worker validates the bytes, authorizes the caller against
// Firestore, and uses the server-only service-role credential.
//
// Public restaurant assets use the `restaurant-assets` bucket and keep their
// existing Firestore URL fields. Private profile images use the
// `profile-images` bucket: Firestore stores only the stable object path in
// `users/{uid}.photoPath`, and the browser obtains a short-lived signed URL
// when it needs to display the image.

import { auth } from '../firebase';
import { API_BASE_URL, transport } from './orderGateway';

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

export const IMAGE_KINDS = Object.freeze({
  PRODUCT: 'product',
  RESTAURANT_LOGO: 'restaurantLogo',
  RESTAURANT_COVER: 'restaurantCover',
  CATEGORY: 'category',
  CUSTOMER_PROFILE: 'customerProfile',
});

function imageError(code, message, status = 0) {
  return Object.assign(new Error(message), { code, status });
}

function configurationError() {
  return imageError(
    'image/not-configured',
    'Image uploads are not configured. Set REACT_APP_API_BASE_URL to the deployed Worker URL.'
  );
}

export function validateImageFile(file) {
  if (!file) return { valid: false, error: 'Choose an image to upload.' };
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'Images must be PNG, JPG, WEBP or GIF.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      valid: false,
      error: `Image must be ${MAX_IMAGE_BYTES / (1024 * 1024)} MB or smaller.`,
    };
  }
  return { valid: true, error: null };
}

// Synchronous capability check used by the existing image picker. It verifies
// that the HTTP Worker transport is configured; the asynchronous upload path
// additionally checks the Worker's Supabase dependency state.
export function isImageStorageConfigured() {
  return transport === 'http' && Boolean(API_BASE_URL);
}

async function getFirebaseIdToken(forceRefresh = false) {
  const user = auth && auth.currentUser;
  if (!user || typeof user.getIdToken !== 'function') {
    throw imageError(
      'image/unauthenticated',
      'You must be signed in to manage images.',
      401
    );
  }

  try {
    return await user.getIdToken(forceRefresh);
  } catch (error) {
    // A token can expire between rendering the page and starting an upload.
    // Firebase normally refreshes it automatically; force one refresh when
    // the cached-token call itself fails.
    if (!forceRefresh) return user.getIdToken(true);
    throw imageError(
      'image/unauthenticated',
      'Your session has expired. Please sign in again.',
      401
    );
  }
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseError(response, data) {
  const status = response.status;
  let code = data && typeof data.code === 'string' ? data.code : '';
  if (!code) {
    if (status === 401) code = 'image/unauthenticated';
    else if (status === 403) code = 'image/forbidden';
    else if (status === 404) code = 'image/endpoint-not-found';
    else if (status === 413) code = 'image/too-large';
    else if (status === 415) code = 'image/invalid';
    else if (status === 503) code = 'image/service-unavailable';
    else code = 'image/request-failed';
  }

  const message =
    (data && typeof data.error === 'string' && data.error) ||
    `The image service responded with ${status}.`;
  return imageError(code, message, status);
}

async function imageServiceStatus() {
  if (!isImageStorageConfigured()) {
    return {
      configured: false,
      code: 'image/not-configured',
      message: 'The Worker image API is not configured.',
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/diagnostics`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const data = await parseJson(response);
    if (!response.ok) {
      return {
        configured: false,
        code: responseError(response, data).code,
        message: 'The Worker diagnostics endpoint is unavailable.',
      };
    }

    const supabase = data && data.dependencies && data.dependencies.supabase;
    if (!supabase) {
      return {
        configured: false,
        code: 'image/service-outdated',
        message: 'The deployed Worker does not expose the Supabase image API.',
      };
    }
    if (supabase.state === 'error') {
      const missing = String(supabase.code || '').startsWith('supabase_');
      return {
        configured: false,
        code: missing
          ? 'image/supabase-not-configured'
          : 'image/service-unavailable',
        message: 'The Worker image service is not configured.',
      };
    }
    return { configured: true, code: '', message: '' };
  } catch {
    return {
      configured: false,
      code: 'image/service-unavailable',
      message: 'The Worker image service could not be reached.',
    };
  }
}

export async function getImageServiceStatus() {
  return imageServiceStatus();
}

async function requestImageApi(
  path,
  {
    method = 'GET',
    body = null,
    headers = {},
    authenticated = true,
    retryUnauthorized = true,
  } = {}
) {
  if (!isImageStorageConfigured()) throw configurationError();

  const requestHeaders = { Accept: 'application/json', ...headers };
  let token = null;
  if (authenticated) {
    token = await getFirebaseIdToken(false);
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    ...(body != null ? { body } : {}),
  });
  const data = await parseJson(response);

  if (response.status === 401 && authenticated && retryUnauthorized) {
    // The Worker rejected the cached token. Refresh it once and replay the
    // request; a 401 means the Worker did not process the upload/delete.
    const refreshedToken = await getFirebaseIdToken(true);
    const retryHeaders = {
      ...requestHeaders,
      Authorization: `Bearer ${refreshedToken}`,
    };
    const retryResponse = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: retryHeaders,
      ...(body != null ? { body } : {}),
    });
    const retryData = await parseJson(retryResponse);
    if (!retryResponse.ok) throw responseError(retryResponse, retryData);
    return retryData;
  }

  if (!response.ok) {
    const error = responseError(response, data);
    if (error.status === 503) {
      const status = await imageServiceStatus();
      if (!status.configured) {
        throw imageError(status.code, status.message, error.status);
      }
    }
    throw error;
  }

  return data || {};
}

function encodedOriginalFilename(file) {
  const name = String((file && file.name) || 'image').trim() || 'image';
  return encodeURIComponent(name);
}

function cleanupDescriptor({ kind, path, restaurantId, resourceId }) {
  if (kind === IMAGE_KINDS.CUSTOMER_PROFILE) {
    return {
      kind,
      path,
      reason: 'profile-remove',
    };
  }

  const fallbackResourceId = String(path || '').split('/').pop()?.split('.')[0] || '';
  return {
    kind,
    path,
    restaurantId,
    resourceId: resourceId || fallbackResourceId,
    reason: 'orphan-cleanup',
  };
}

/**
 * Upload an image through the authenticated Worker API.
 *
 * `ownerUid` is accepted only for call-site compatibility and is deliberately
 * ignored: identity comes from the verified Firebase token on the Worker, not
 * from a browser-supplied uid.
 */
export async function uploadImageAsset(
  file,
  { kind, ownerUid: _ignoredOwnerUid, restaurantId, resourceId, onProgress } = {}
) {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw imageError('image/invalid', validation.error, 400);
  }
  if (!kind) {
    throw imageError('image/invalid', 'An image kind is required.', 400);
  }
  if (!isImageStorageConfigured()) throw configurationError();

  if (typeof onProgress === 'function') onProgress(0);

  const headers = {
    'Content-Type': file.type,
    'X-Image-Kind': kind,
    'X-Original-Filename': encodedOriginalFilename(file),
  };
  if (restaurantId) headers['X-Restaurant-Id'] = restaurantId;

  const data = await requestImageApi('/api/images/upload', {
    method: 'POST',
    body: file,
    headers,
  });

  const objectPath = String(data.objectPath || data.reference || '').trim();
  if (!objectPath) {
    throw imageError(
      'image/invalid-response',
      'The image service returned no object path.'
    );
  }

  const isPrivateProfile = kind === IMAGE_KINDS.CUSTOMER_PROFILE;
  const result = {
    // Private profile uploads deliberately do not expose a public URL. The
    // canonical path is persisted and a signed URL is requested separately.
    url: isPrivateProfile ? objectPath : String(data.url || data.reference || ''),
    objectPath,
    reference: String(data.reference || objectPath),
    bucket: data.bucket || '',
    contentType: data.contentType || file.type,
    private: isPrivateProfile,
    deleteRequest: cleanupDescriptor({
      kind,
      path: objectPath,
      restaurantId,
      resourceId,
    }),
  };

  if (typeof onProgress === 'function') onProgress(100);
  return result;
}

// Backwards-compatible helper: callers that only need the persisted reference
// receive a string.
export async function uploadImage(file, options = {}) {
  const uploaded = await uploadImageAsset(file, options);
  return uploaded.url;
}

/** Create a short-lived signed URL for the signed-in user's private image. */
export async function getProfileImageSignedUrl(path) {
  const objectPath = String(path || '').trim();
  if (!objectPath) {
    throw imageError('image/path-missing', 'The profile image path is required.', 400);
  }
  return requestImageApi('/api/images/profile/signed-url', {
    method: 'POST',
    body: JSON.stringify({ path: objectPath }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Explicitly delete a Supabase image through the Worker's guarded endpoint. */
export async function deleteImageAsset({
  kind,
  path,
  reason,
  restaurantId,
  resourceId,
} = {}) {
  if (!kind || !path || !reason) {
    throw imageError(
      'image/delete-request-invalid',
      'The image deletion request is incomplete.',
      400
    );
  }
  return requestImageApi('/api/images', {
    method: 'DELETE',
    body: JSON.stringify({ kind, path, reason, restaurantId, resourceId }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Conservative cleanup hook used by the image pipeline.
 *
 * A URL alone is not enough to authorize deletion: public deletion also needs
 * the resource id and an explicit reason. Existing Firebase URLs and pasted
 * external URLs are therefore never deleted. New Supabase uploads provide a
 * complete delete descriptor, which is used only when their Firestore save
 * fails.
 */
export async function deleteImage(_url, deleteRequest = null) {
  if (!deleteRequest) return false;
  try {
    await deleteImageAsset(deleteRequest);
    return true;
  } catch {
    return false;
  }
}

// Local preview helpers (never persisted).
export function createPreviewUrl(file) {
  if (typeof URL === 'undefined' || !URL.createObjectURL) return '';
  return URL.createObjectURL(file);
}

export function revokePreviewUrl(url) {
  if (url && typeof url === 'string' && url.startsWith('blob:') && URL.revokeObjectURL) {
    URL.revokeObjectURL(url);
  }
}

const imageService = {
  MAX_IMAGE_BYTES,
  ACCEPTED_IMAGE_TYPES,
  IMAGE_KINDS,
  validateImageFile,
  isImageStorageConfigured,
  getImageServiceStatus,
  uploadImageAsset,
  uploadImage,
  getProfileImageSignedUrl,
  deleteImageAsset,
  deleteImage,
  createPreviewUrl,
  revokePreviewUrl,
};

export default imageService;
