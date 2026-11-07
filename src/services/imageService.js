// Firebase Storage image access for the customer and restaurant apps.
//
// Image files never live in Firestore. The safe write sequence is:
//   1. upload the bytes to a scoped Storage object;
//   2. retrieve the download URL;
//   3. save that URL in the owning Firestore document;
//   4. remove the old object only after the Firestore save succeeds.
//
// `commitImagePipeline` in `imagePipeline.js` coordinates that sequence and
// removes a newly uploaded object when the Firestore save fails.

import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import app from '../firebase';

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
  CUSTOMER_PROFILE: 'customerProfile',
});

const EXTENSION_BY_TYPE = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
});

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

// The project and bucket are intentionally derived from the existing Firebase
// configuration. Do not silently fall back to another bucket: using the wrong
// bucket would create files that the deployed rules do not protect.
export function getConfiguredStorageBucketName() {
  return String(process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || '')
    .trim()
    .replace(/^gs:\/\//, '')
    .replace(/\/+$/, '');
}

export function getExpectedStorageBucketName() {
  const projectId = String(process.env.REACT_APP_FIREBASE_PROJECT_ID || '').trim();
  return projectId ? `${projectId}.firebasestorage.app` : '';
}

export function isImageStorageConfigured() {
  const configured = getConfiguredStorageBucketName();
  const expected = getExpectedStorageBucketName();
  return Boolean(configured && expected && configured === expected);
}

function notConfiguredError() {
  const configured = getConfiguredStorageBucketName();
  const expected = getExpectedStorageBucketName();
  const detail =
    configured && expected && configured !== expected
      ? ` Configured bucket "${configured}" does not match the Firebase project bucket "${expected}".`
      : '';
  return Object.assign(
    new Error(
      `Image uploads are not configured.${detail} Set REACT_APP_FIREBASE_STORAGE_BUCKET to "${expected}", or paste an image URL instead.`
    ),
    { code: 'storage/not-configured' }
  );
}

function safeSegment(value, label) {
  const clean = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!clean) throw new Error(`${label} is required for an image upload.`);
  return clean;
}

function randomName(file) {
  const extension = EXTENSION_BY_TYPE[file.type] || 'jpg';
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${random}.${extension}`;
}

// Builds owner-scoped paths. The owner uid in the path lets the Storage rules
// distinguish an administrator's upload from another administrator's upload.
export function buildImageObjectPath({
  kind,
  ownerUid,
  restaurantId,
  file,
  path,
} = {}) {
  const name = randomName(file || { type: 'image/jpeg' });

  if (kind === IMAGE_KINDS.PRODUCT) {
    return `products/${safeSegment(restaurantId, 'Restaurant id')}/${safeSegment(
      ownerUid,
      'Owner uid'
    )}/${name}`;
  }

  if (
    kind === IMAGE_KINDS.RESTAURANT_LOGO ||
    kind === IMAGE_KINDS.RESTAURANT_COVER
  ) {
    const branding = kind === IMAGE_KINDS.RESTAURANT_LOGO ? 'logo' : 'cover';
    return `restaurants/${safeSegment(
      restaurantId,
      'Restaurant id'
    )}/branding/${branding}/${safeSegment(ownerUid, 'Owner uid')}/${name}`;
  }

  if (kind === IMAGE_KINDS.CUSTOMER_PROFILE) {
    return `users/${safeSegment(ownerUid, 'User uid')}/profile/${name}`;
  }

  // Backwards-compatible escape hatch for older callers. New code must use a
  // kind so the Storage rules can authorize it.
  const legacyPath = String(path || '').trim().replace(/^\/+|\/+$/g, '');
  if (!legacyPath) throw new Error('An image path is required.');
  return `${legacyPath}/${name}`;
}

function storageInstance() {
  return getStorage(app);
}

function waitForUpload(task, onProgress) {
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes) {
          const percent = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          onProgress(Math.max(0, Math.min(100, percent)));
        }
      },
      (error) => reject(error),
      (snapshot) => resolve(snapshot)
    );
  });
}

// Uploads a file and returns both its download URL and canonical object path.
// If URL retrieval fails after the bytes were accepted, the new object is
// removed immediately so a failed upload cannot become an orphan.
export async function uploadImageAsset(
  file,
  { kind, ownerUid, restaurantId, path, onProgress } = {}
) {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw Object.assign(new Error(validation.error), { code: 'image/invalid' });
  }
  if (!isImageStorageConfigured()) {
    throw notConfiguredError();
  }

  const objectPath = buildImageObjectPath({
    kind,
    ownerUid,
    restaurantId,
    file,
    path,
  });
  const storage = storageInstance();
  const objectRef = ref(storage, objectPath);
  const task = uploadBytesResumable(objectRef, file, {
    contentType: file.type,
  });

  try {
    const snapshot = await waitForUpload(task, onProgress);
    const url = await getDownloadURL(snapshot.ref || task.snapshot.ref);
    return { url, objectPath };
  } catch (error) {
    try {
      if (typeof task.cancel === 'function') task.cancel();
    } catch (cancelError) {
      /* the upload may already have settled */
    }
    try {
      await deleteObject(objectRef);
    } catch (deleteError) {
      /* best-effort cleanup; preserve the original upload error */
    }
    throw error;
  }
}

// Backwards-compatible helper: callers that only need the URL receive a string.
export async function uploadImage(file, options = {}) {
  const uploaded = await uploadImageAsset(file, options);
  return uploaded.url;
}

// Extracts the bucket from a Firebase Storage download URL without attempting
// to delete it. This prevents an image URL from another bucket/project from
// being passed to `ref` by mistake.
export function getStorageBucketFromUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';

  if (value.startsWith('gs://')) {
    return value.slice('gs://'.length).split('/')[0];
  }

  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/\/v0\/b\/([^/]+)\/o(?:\/|$)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch (error) {
    return '';
  }
}

export function isImageUrlForConfiguredBucket(url) {
  const configured = getConfiguredStorageBucketName();
  const bucket = getStorageBucketFromUrl(url);
  return Boolean(configured && bucket && bucket === configured);
}

// Deletes a Firebase Storage object using `ref`. Only URLs belonging to the
// configured project bucket are accepted; external/pasted image URLs are left
// untouched. The function is intentionally best-effort and never throws.
//
// Firebase v12 no longer exports the old `refFromURL` helper. The public `ref`
// API accepts a full storage URL as its second argument and resolves it to the
// same StorageReference.
export async function deleteImage(url) {
  if (!isImageUrlForConfiguredBucket(url)) return false;

  try {
    const storage = storageInstance();
    const objectRef = ref(storage, url);
    await deleteObject(objectRef);
    return true;
  } catch (error) {
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
  getConfiguredStorageBucketName,
  getExpectedStorageBucketName,
  isImageStorageConfigured,
  buildImageObjectPath,
  uploadImageAsset,
  uploadImage,
  getStorageBucketFromUrl,
  isImageUrlForConfiguredBucket,
  deleteImage,
  createPreviewUrl,
  revokePreviewUrl,
};

export default imageService;
