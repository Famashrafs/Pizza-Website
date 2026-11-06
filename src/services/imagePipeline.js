// Transaction-like orchestration for Firestore-backed image fields.
//
// A pipeline can contain one or more image fields. Every pending file is
// uploaded first, then all new URLs are persisted in one Firestore save. If an
// upload or the Firestore save fails, every newly uploaded object from this
// pipeline is removed. Only after a successful Firestore save are the previous
// objects removed.

import { deleteImage } from './imageService';

function failedSaveError(result) {
  const error = new Error(
    (result && result.error) || 'The image reference could not be saved.'
  );
  error.code = 'image/save-failed';
  return error;
}

function uploadedUrl(result) {
  if (typeof result === 'string') return result;
  if (result && typeof result.url === 'string') return result.url;
  return '';
}

async function safeDelete(cleanup, url) {
  if (!cleanup || !url) return false;
  try {
    return Boolean(await cleanup(url));
  } catch (error) {
    return false;
  }
}

/**
 * @param {Object} options
 * @param {Array<{key: string, upload?: Function, value?: string, oldUrl?: string}>} options.changes
 * @param {Function} options.save Receives a `{ key: newUrl }` map and persists it.
 * @param {Function} options.cleanup Optional deletion function (defaults to deleteImage).
 */
export async function commitImagePipeline({
  changes = [],
  save,
  cleanup = deleteImage,
} = {}) {
  if (typeof save !== 'function') {
    throw new Error('A Firestore save function is required.');
  }

  const prepared = [];
  const uploaded = [];

  try {
    for (const change of changes) {
      if (!change || !change.key) {
        throw new Error('Every image change requires a key.');
      }

      let nextUrl;
      if (typeof change.upload === 'function') {
        const result = await change.upload();
        nextUrl = uploadedUrl(result);
        if (!nextUrl) {
          const error = new Error(`The ${change.key} image upload did not return a URL.`);
          error.code = 'image/upload-url-missing';
          throw error;
        }
        uploaded.push({ key: change.key, url: nextUrl });
      } else {
        nextUrl = change.value == null ? '' : String(change.value);
      }

      prepared.push({
        key: change.key,
        url: nextUrl,
        oldUrl: change.oldUrl || '',
      });
    }

    const values = prepared.reduce((result, item) => {
      result[item.key] = item.url;
      return result;
    }, {});

    const saved = await save(values);
    if (saved == null || saved.success === false) {
      throw failedSaveError(saved);
    }

    // Old objects are removed only after the Firestore write has succeeded.
    const cleanupResults = [];
    for (const item of prepared) {
      const removed =
        item.oldUrl && item.oldUrl !== item.url
          ? await safeDelete(cleanup, item.oldUrl)
          : false;
      cleanupResults.push({
        key: item.key,
        oldUrl: item.oldUrl,
        removed,
      });
    }

    return { saved, values, cleanupResults };
  } catch (error) {
    // `imagePersisted` is reserved for the rare case where the Firestore write
    // succeeded but a later consistency repair failed. In that case the new
    // object is still referenced and must not be deleted.
    if (!error || error.imagePersisted !== true) {
      await Promise.all(uploaded.map((item) => safeDelete(cleanup, item.url)));
    }
    throw error;
  }
}

export default commitImagePipeline;
