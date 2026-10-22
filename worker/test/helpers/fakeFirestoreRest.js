// In-memory stand-in for the Firestore REST API, used by the Worker tests to
// exercise the REAL adapter (worker/src/firestore.js) — including begin /
// transactional-read / commit semantics and 409 ABORTED conflicts — without
// any network access or credentials.

'use strict';

let txCounter = 0;
let clockCounter = 0;

// Firestore REST validates DocumentTransform strictly: an unknown property
// (e.g. the Admin-SDK/gRPC shape `serverTimestamp: {}`) is rejected with
//   400 Invalid JSON payload received. Unknown name "serverTimestamp" at
//      'writes[0].update_transforms[0]'. Cannot find field.
// The fake mirrors that validation so a regression in the adapter's
// serializer fails the tests loudly instead of passing silently.
const ALLOWED_TRANSFORM_KEYS = new Set([
  'fieldPath',
  'setToServerValue',
  'increment',
  'maximum',
  'minimum',
  'appendMissingElements',
  'removeAllFromArray',
]);
const TRANSFORM_TYPE_KEYS = [
  'setToServerValue',
  'increment',
  'maximum',
  'minimum',
  'appendMissingElements',
  'removeAllFromArray',
];

function validateWrites(writes) {
  for (let w = 0; w < writes.length; w += 1) {
    const transforms = (writes[w] && writes[w].updateTransforms) || [];
    for (let t = 0; t < transforms.length; t += 1) {
      const transform = transforms[t];
      for (const key of Object.keys(transform)) {
        if (ALLOWED_TRANSFORM_KEYS.has(key)) continue;
        const message = `Invalid JSON payload received. Unknown name "${key}" at 'writes[${w}].update_transforms[${t}]'. Cannot find field.`;
        return { error: { code: 400, message, errors: [{ message, domain: 'global', reason: 'invalid' }] } };
      }
      if (!TRANSFORM_TYPE_KEYS.some((key) => key in transform)) {
        const message = `Invalid JSON payload received. Missing one of [${TRANSFORM_TYPE_KEYS.join(', ')}] at 'writes[${w}].update_transforms[${t}]'.`;
        return { error: { code: 400, message, errors: [{ message, domain: 'global', reason: 'invalid' }] } };
      }
    }
  }
  return null;
}

export function createFakeFirestoreRest() {
  /** @type {Map<string, { fields: object, version: number }>} */
  const docs = new Map();
  /** @type {Map<string, number>} */
  const collectionVersions = new Map();
  /** @type {Map<string, { reads: Map<string, number>, collections: Map<string, number> }>} */
  const transactions = new Map();
  const requests = [];

  const bumpCollection = (path) => {
    const collection = path.split('/').slice(0, -1).join('/');
    collectionVersions.set(collection, (collectionVersions.get(collection) || 0) + 1);
  };

  const docVersion = (path) => (docs.has(path) ? docs.get(path).version : 0);
  const collectionVersion = (path) => {
    const collection = path.split('/').slice(0, -1).join('/');
    return collectionVersions.get(collection) || 0;
  };

  function recordRead(transaction, path) {
    const tx = transactions.get(transaction);
    if (!tx) return;
    if (!tx.reads.has(path)) {
      tx.reads.set(path, docVersion(path));
      const collection = path.split('/').slice(0, -1).join('/');
      if (!tx.collections.has(collection)) {
        tx.collections.set(collection, collectionVersion(path));
      }
    }
  }

  function applyWrite(write) {
    const full = String(write.update.name);
    const rel = full.includes('/documents/') ? full.split('/documents/')[1] : full;

    const existing = docs.get(rel) || { fields: {}, version: 0 };
    const fields = { ...existing.fields };

    if (write.updateMask && Array.isArray(write.updateMask.fieldPaths)) {
      for (const key of write.updateMask.fieldPaths) {
        if (write.update.fields && key in write.update.fields) {
          fields[key] = write.update.fields[key];
        } else {
          delete fields[key];
        }
      }
    } else {
      // Full replace.
      for (const key of Object.keys(fields)) delete fields[key];
      Object.assign(fields, write.update.fields || {});
    }

    for (const transform of write.updateTransforms || []) {
      if (transform.setToServerValue !== 'REQUEST_TIME') continue;
      clockCounter += 1;
      fields[transform.fieldPath] = {
        timestampValue: new Date(1700000000000 + clockCounter * 1000).toISOString(),
      };
    }

    docs.set(rel, { fields, version: existing.version + 1 });
    bumpCollection(rel);
  }

  function matchesFilter(docFields, filter, relPath) {
    if (filter.compositeFilter) {
      return filter.compositeFilter.filters.every((f) => matchesFilter(docFields, f, relPath));
    }
    const { field, op, value } = filter.fieldFilter;
    // Exact-document reads use an __name__ equality filter (see
    // worker/src/firestore.js _getDocument) — match it against the
    // document's full resource name.
    if (field.fieldPath === '__name__') {
      if (op !== 'EQUAL') throw new Error(`fake Firestore REST: unsupported __name__ op ${op}`);
      const target = String((value && value.referenceValue) || '');
      return Boolean(relPath) && target.endsWith(`/documents/${relPath}`);
    }
    const actual = docFields[field.fieldPath];
    if (op === 'EQUAL') return JSON.stringify(actual) === JSON.stringify(value);
    throw new Error(`fake Firestore REST: unsupported op ${op}`);
  }

  async function fetchImpl(url, options = {}) {
    const parsed = new URL(url);
    const pathWithQuery = parsed.pathname + parsed.search;
    requests.push({ url: pathWithQuery, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });

    const body = options.body ? JSON.parse(options.body) : null;
    const transaction = parsed.searchParams.get('transaction') || (body && body.transaction) || null;

    // RPC endpoints end with `:verb` and live on the documents collection.
    const rpcMatch = /:([a-zA-Z]+)$/.exec(parsed.pathname);
    if (rpcMatch && options.method === 'POST') {
      const rpc = rpcMatch[1];

      if (rpc === 'beginTransaction') {
        const id = `tx-${++txCounter}`;
        transactions.set(id, { reads: new Map(), collections: new Map() });
        return json(200, { transaction: id });
      }

      if (rpc === 'runQuery') {
        const structured = body.structuredQuery;
        const collectionId = structured.from[0].collectionId;
        if (transaction) {
          const tx = transactions.get(transaction);
          if (!tx) return json(409, { error: { code: 9, message: 'invalid transaction' } });

          // Real Firestore registers a read even when the query matches
          // NOTHING (point reads of missing docs and query ranges are part of
          // the read set) — otherwise a concurrent checkout's insert would go
          // undetected and idempotency would break.
          const nameFilter =
            structured.where &&
            structured.where.fieldFilter &&
            structured.where.fieldFilter.field &&
            structured.where.fieldFilter.field.fieldPath === '__name__';
          if (nameFilter) {
            const rel = String(structured.where.fieldFilter.value.referenceValue || '').split('/documents/').pop();
            recordRead(transaction, rel);
          } else {
            const after = parsed.pathname.slice(parsed.pathname.indexOf('/documents') + '/documents'.length);
            const parentPath = after.startsWith(':') ? '' : after.slice(1, after.lastIndexOf(':'));
            const scope = parentPath ? `${parentPath}/${collectionId}` : collectionId;
            if (!tx.collections.has(scope)) {
              tx.collections.set(scope, collectionVersions.get(scope) || 0);
            }
          }
        }
        const rows = [];
        for (const [path, entry] of docs) {
          if (!path.startsWith(`${collectionId}/`)) continue;
          if (structured.where && !matchesFilter(entry.fields, structured.where, path)) continue;
          if (transaction) recordRead(transaction, path);
          rows.push({
            document: { name: `${parsed.pathname.split('/documents/')[0]}/documents/${path}`, fields: entry.fields },
            readTime: '2026-01-01T00:00:00Z',
          });
        }
        return json(200, rows);
      }

      if (rpc === 'commit') {
        const tx = transactions.get(body.transaction);
        if (!tx) return json(409, { error: { code: 9, message: 'invalid transaction' } });

        // Strict transform validation (mirrors the real REST API).
        const invalid = validateWrites(body.writes || []);
        if (invalid) return json(400, invalid);

        // Conflict detection: any write document that was READ in this
        // transaction (or whose COLLECTION was read) must be unchanged.
        for (const write of body.writes || []) {
          const rel = String(write.update.name).includes('/documents/')
            ? String(write.update.name).split('/documents/')[1]
            : String(write.update.name);
          if (tx.reads.has(rel) && tx.reads.get(rel) !== docVersion(rel)) {
            return json(409, { error: { code: 9, message: 'transaction conflict' } });
          }
          for (const [collection, version] of tx.collections) {
            if (rel.startsWith(`${collection}/`) && collectionVersion(rel) !== version) {
              return json(409, { error: { code: 9, message: 'query conflict' } });
            }
          }
        }

        for (const write of body.writes || []) applyWrite(write);
        transactions.delete(body.transaction);
        return json(200, {
          writeResults: (body.writes || []).map(() => ({})),
          commitTime: '2026-01-01T00:00:00Z',
        });
      }

      return json(404, { error: { code: 5, message: 'unknown RPC' } });
    }

    // Plain document GET.
    const base = parsed.pathname.split('/documents/')[0];
    const rel = parsed.pathname.slice(parsed.pathname.indexOf('/documents/') + '/documents/'.length);
    const entry = docs.get(rel);
    if (transaction) recordRead(transaction, rel);
    if (!entry) return json(404, { error: { code: 5, message: 'not found' } });
    return json(200, { name: `${base}/documents/${rel}`, fields: entry.fields });
  }

  function json(status, payload) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    };
  }

  // Seed helpers (values are PLAIN JS; encoding goes through the real adapter
  // when writes flow through REST, but seeding writes REST values directly).
  function seedDoc(rel, plain) {
    const fields = {};
    for (const key of Object.keys(plain)) fields[key] = encodePlain(plain[key]);
    docs.set(rel, { fields, version: (docs.get(rel)?.version || 0) + 1 });
    bumpCollection(rel);
  }

  function readDoc(rel) {
    const entry = docs.get(rel);
    if (!entry) return null;
    return decodePlainFields(entry.fields);
  }

  return { fetchImpl, seedDoc, readDoc, requests, docs };
}

// Minimal plain→REST encoding for seeding (mirrors worker/src/firestore.js).
function encodePlain(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodePlain) } };
  if (typeof value === 'object') return { mapValue: { fields: encodePlainFields(value) } };
  throw new Error('unsupported seed value');
}

function encodePlainFields(obj) {
  const fields = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) continue;
    fields[key] = encodePlain(obj[key]);
  }
  return fields;
}

function decodePlain(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return new Date(value.timestampValue).toISOString();
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodePlain);
  if ('mapValue' in value) return decodePlainFields(value.mapValue.fields || {});
  return null;
}

function decodePlainFields(fields) {
  const out = {};
  for (const key of Object.keys(fields)) out[key] = decodePlain(fields[key]);
  return out;
}
