// Transaction-like orchestration for Firestore-backed image fields.
//
// A pipeline can contain one or more image fields. Every pending file is
// uploaded first, then all new references are persisted in one Firestore
// save. If an upload or the Firestore save fails, every newly uploaded object
// from this pipeline is removed.
//
// Old objects are NOT deleted automatically after a successful save. Existing
// products, restaurants, profiles, and historical orders may still reference
// an old image. Deletion is an explicit, separately authorized Worker action
// (`deleteImageAsset`) and must be requested only when the caller has checked
// every reference.

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

function uploadedReference(result) {
  if (!result || typeof result !== 'object') return uploadedUrl(result);
  if (typeof result.reference === 'string' && result.reference) {
    return result.reference;
  }
  if (typeof result.objectPath === 'string' && result.objectPath) {
    return result.objectPath;
  }
  return uploadedUrl(result);
}

async function safeDelete(cleanup, value, deleteRequest = null) {
  if (!cleanup || !value) return false;
  try {
    return Boolean(await cleanup(value, deleteRequest));
  } catch (error) {
    return false;
  }
}

/**
 * @param {Object} options
 * @param {Array<{key: string, upload?: Function, value?: string, oldUrl?: string}>} options.changes
 * @param {Function} options.save Receives `(values, references)` and persists them.
 * @param {Function} options.cleanup Optional deletion function (defaults to deleteImage).
 * @param {boolean} options.cleanupOld Whether to delete old objects after a
 *   successful save. Defaults to false because old images may still be
 *   referenced by existing records or historical orders.
 */
export async function commitImagePipeline({
  changes = [],
  save,
  cleanup = deleteImage,
  cleanupOld = false,
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
      let nextReference;
      if (typeof change.upload === 'function') {
        const result = await change.upload();
        nextUrl = uploadedUrl(result);
        nextReference = uploadedReference(result);
        if (!nextUrl && !nextReference) {
          const error = new Error(`The ${change.key} image upload did not return a URL.`);
          error.code = 'image/upload-url-missing';
          throw error;
        }
        uploaded.push({
          key: change.key,
          url: nextUrl,
          reference: nextReference,
          deleteRequest: result && typeof result === 'object' ? result.deleteRequest : null,
        });
      } else {
        nextUrl = change.value == null ? '' : String(change.value);
        nextReference = nextUrl;
      }

      prepared.push({
        key: change.key,
        url: nextUrl,
        reference: nextReference,
        oldUrl: change.oldUrl || '',
      });
    }

    const values = prepared.reduce((result, item) => {
      result[item.key] = item.url || item.reference;
      return result;
    }, {});
    const references = prepared.reduce((result, item) => {
      result[item.key] = item.reference || item.url;
      return result;
    }, {});

    const saved = await save(values, references);
    if (saved == null || saved.success === false) {
      throw failedSaveError(saved);
    }

    // Old objects are removed only when the caller explicitly opts in. The
    // default is conservative because an old asset may still be referenced by
    // a product, restaurant, profile, or historical order.
    const cleanupResults = [];
    if (cleanupOld) {
      for (const item of prepared) {
        const removed =
          item.oldUrl && item.oldUrl !== item.url
            ? await safeDelete(cleanup, item.oldUrl, item.oldDeleteRequest || null)
            : false;
        cleanupResults.push({
          key: item.key,
          oldUrl: item.oldUrl,
          removed,
        });
      }
    }

    return { saved, values, references, cleanupResults };
  } catch (error) {
    // `imagePersisted` is reserved for the rare case where the Firestore write
    // succeeded but a later consistency repair failed. In that case the new
    // object is still referenced and must not be deleted.
    if (!error || error.imagePersisted !== true) {
      await Promise.all(
        uploaded.map((item) =>
          safeDelete(cleanup, item.url || item.reference, item.deleteRequest)
        )
      );
    }
    throw error;
  }
}

export default commitImagePipeline;
