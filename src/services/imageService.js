// Image handling for the admin dashboard.
//
// The customer-facing app ships static assets; the dashboard lets owners set a
// product/restaurant image. We support two paths honestly:
//
//   1. Paste an image URL — always available, stored as the image reference.
//   2. Upload a file — delegates to Firebase Storage *if it is configured*
//      (REACT_APP_FIREBASE_STORAGE_BUCKET). Uploads stream to Storage and only
//      the resulting download URL is persisted, so large binaries never touch
//      the database or localStorage.
//
// When Storage is not configured we surface a clear error instead of pretending
// the upload worked — the UI falls back to the URL field.

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

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

// Storage is "configured" only when a bucket is present. The Firebase project
// (apiKey/projectId) is already required by firebase.js.
export function isImageStorageConfigured() {
  return Boolean(process.env.REACT_APP_FIREBASE_STORAGE_BUCKET);
}

function notConfiguredError() {
  return Object.assign(
    new Error(
      'Image uploads are not configured. Add a Firebase Storage bucket (REACT_APP_FIREBASE_STORAGE_BUCKET) to .env.local, or paste an image URL instead.'
    ),
    { code: 'storage/not-configured' }
  );
}

function randomName(file) {
  const ext = (String(file.name).split('.').pop() || 'jpg').toLowerCase();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

// Uploads a file to Firebase Storage and resolves with its download URL.
// `onProgress(percent)` is called as bytes transfer.
export async function uploadImage(file, { path = 'menu', onProgress } = {}) {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw Object.assign(new Error(validation.error), { code: 'image/invalid' });
  }
  if (!isImageStorageConfigured()) {
    throw notConfiguredError();
  }

  const [{ getStorage, ref, uploadBytesResumable, getDownloadURL }, firebaseModule] =
    await Promise.all([import('firebase/storage'), import('../firebase')]);
  const app = firebaseModule.default;
  const storage = getStorage(app);

  const objectRef = ref(storage, `${path}/${randomName(file)}`);
  const task = uploadBytesResumable(objectRef, file);

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (error) => reject(error),
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

// Best-effort removal of a previously uploaded object. Never throws so callers
// can safely "replace"/"remove" an image even when Storage is unavailable.
export async function deleteImage(url) {
  if (!url || !isImageStorageConfigured() || !/^https?:\/\//.test(url)) return false;
  try {
    const [{ getStorage, ref, deleteObject }, firebaseModule] = await Promise.all([
      import('firebase/storage'),
      import('../firebase'),
    ]);
    const app = firebaseModule.default;
    const storage = getStorage(app);
    await deleteObject(ref(storage, url));
    return true;
  } catch (err) {
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
  validateImageFile,
  isImageStorageConfigured,
  uploadImage,
  deleteImage,
  createPreviewUrl,
  revokePreviewUrl,
};

export default imageService;
