// Firestore REST adapter exposing the minimal Admin-SDK-shaped interface the
// shared order engine (functions/lib/orderServiceCore.js) expects:
//
//   db.collection(name).doc(id).get()          → { exists, id, data() }
//   db.collection(name).where(f, '==', v)      → query with .get() / tx.get()
//   db.runTransaction(async (tx) => { ... })   → tx.get / tx.set / tx.update
//   serverTimestamp()                          → sentinel handled by the adapter
//
// Why REST: the Firebase Admin SDK cannot run on Cloudflare Workers (Node +
// gRPC). The Firestore REST API with OAuth2 service-account credentials gives
// the SAME authenticated, security-rules-bypassing server access, and its
// beginTransaction / transactional reads / commit protocol preserves the
// engine's transactional idempotency and conflict-retry semantics.
//
// Emulator support: set FIRESTORE_EMULATOR_HOST=127.0.0.1:8401 to target the
// local emulator over plain HTTP without real credentials.

'use strict';

const SERVER_TIMESTAMP = Symbol('serverTimestamp');

export function serverTimestamp() {
  return { __serverTimestamp: SERVER_TIMESTAMP };
}

function isServerTimestamp(value) {
  return Boolean(value) && typeof value === 'object' && value.__serverTimestamp === SERVER_TIMESTAMP;
}

// --- Value encoding (plain JS → Firestore REST value) -----------------------

export function encodeValue(value) {
  if (value === undefined || value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: encodeFields(value) } };
  }
  throw new Error(`Cannot encode value of type ${typeof value} for Firestore.`);
}

export function encodeFields(obj) {
  const fields = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) continue;
    if (isServerTimestamp(obj[key])) continue; // handled via field transforms
    fields[key] = encodeValue(obj[key]);
  }
  return fields;
}

// --- Value decoding (Firestore REST value → plain JS) -----------------------

function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) {
    // RFC3339 UTC string — matches the ISO strings the client read path and
    // the shared engine's serializeOrder() already produce.
    return new Date(value.timestampValue).toISOString();
  }
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(decodeValue);
  }
  if ('mapValue' in value) {
    return decodeFields(value.mapValue.fields || {});
  }
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('bytesValue' in value) return value.bytesValue;
  return null;
}

export function decodeFields(fields = {}) {
  const out = {};
  for (const key of Object.keys(fields)) out[key] = decodeValue(fields[key]);
  return out;
}

function decodeDocument(doc) {
  if (!doc) return null;
  const name = String(doc.name || '');
  const id = name.split('/').pop();
  return { id, name, data: decodeFields(doc.fields || {}) };
}

// --- Query serialization ----------------------------------------------------

function encodeFilter(field, op, value) {
  const operators = { '==': 'EQUAL', '!=': 'NOT_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL' };
  const operator = operators[op] || op;
  return {
    fieldFilter: {
      field: { fieldPath: field },
      op: operator,
      value: encodeValue(value === undefined ? null : value),
    },
  };
}

// --- Write serialization ----------------------------------------------------

// A staged set()/update() becomes one Firestore REST Write. Server-timestamp
// fields become updateTransforms (the server, not the client, stamps them).
// `documentsBase` is the `.../documents` prefix so update.name is a FULL
// document resource name, as the REST API requires.
//
// REST transform shape (Firestore v1 DocumentTransform):
//   { "fieldPath": "createdAt", "setToServerValue": "REQUEST_TIME" }
// The Admin SDK's `serverTimestamp: {}` is the Admin/gRPC shape and is REJECTED
// by the REST API with:
//   400 Invalid JSON payload received. Unknown name "serverTimestamp" at
//       'writes[0].update_transforms[0]'. Cannot find field.
function toWrite({ type, path, data }, documentsBase) {
  const transforms = [];
  const maskPaths = [];
  const fields = {};

  for (const key of Object.keys(data)) {
    const value = data[key];
    if (value === undefined) continue;
    if (isServerTimestamp(value)) {
      maskPaths.push(key);
      transforms.push({ fieldPath: key, setToServerValue: 'REQUEST_TIME' });
      continue;
    }
    maskPaths.push(key);
    fields[key] = encodeValue(value);
  }

  const write = {
    update: { name: `${documentsBase}/${path}`, fields },
    // Full replace for set(), masked merge for update(): with a mask only the
    // listed top-level paths are written, so tx.update(partial) can never
    // clobber sibling fields (mirrors the Admin SDK's update()).
    updateMask: { fieldPaths: maskPaths },
  };
  if (transforms.length) write.updateTransforms = transforms;
  return write;
}

// --- Adapter ----------------------------------------------------------------

class DocumentSnapshot {
  constructor(doc) {
    this.id = doc ? doc.id : null;
    this._data = doc ? doc.data : null;
    this.exists = doc !== null;
  }

  data() {
    return this._data;
  }
}

class QuerySnapshot {
  constructor(docs) {
    this._docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
  }

  get docs() {
    return this._docs;
  }

  forEach(cb) {
    for (const doc of this._docs) cb(doc);
  }
}

class Query {
  constructor(db, collectionId, filters, parentPath = '') {
    this._db = db;
    this._collectionId = collectionId;
    this._filters = filters;
    this._parentPath = parentPath;
  }

  where(field, op, value) {
    return new Query(
      this._db,
      this._collectionId,
      [...this._filters, encodeFilter(field, op, value)],
      this._parentPath
    );
  }

  _structuredQuery() {
    return {
      from: [{ collectionId: this._collectionId, allDescendants: false }],
      ...(this._filters.length
        ? { where: this._filters.length === 1 ? this._filters[0] : { compositeFilter: { op: 'AND', filters: this._filters } } }
        : {}),
    };
  }

  async get(options = {}) {
    const rows = await this._db._runQuery(this._structuredQuery(), this._parentPath, options);
    return new QuerySnapshot(rows.map((row) => new DocumentSnapshot(row)));
  }
}

class DocumentReference {
  constructor(db, path) {
    this._db = db;
    this.path = path;
    this.id = path.split('/').pop();
  }

  async get(options = {}) {
    const doc = await this._db._getDocument(this.path, options);
    return new DocumentSnapshot(doc);
  }
}

class CollectionReference extends Query {
  constructor(db, collectionId, parentPath = '') {
    super(db, collectionId, [], parentPath);
  }

  doc(id) {
    const child = String(id);
    if (!child || child.includes('/')) {
      throw new Error('doc() requires a single-segment document id.');
    }
    return new DocumentReference(
      this._db,
      this._parentPath ? `${this._parentPath}/${this._collectionId}/${child}` : `${this._collectionId}/${child}`
    );
  }
}

class Transaction {
  constructor(db, id) {
    this._db = db;
    this._id = id;
    this._staged = [];
  }

  async get(refOrQuery) {
    if (refOrQuery instanceof DocumentReference) {
      return refOrQuery.get({ transaction: this._id });
    }
    if (refOrQuery instanceof Query) {
      return refOrQuery.get({ transaction: this._id });
    }
    throw new Error('tx.get() requires a document or query reference.');
  }

  set(ref, data) {
    this._staged.push({ type: 'set', path: ref.path, data });
  }

  update(ref, data) {
    this._staged.push({ type: 'update', path: ref.path, data });
  }
}

/**
 * Create a Firestore-compatible `db` for the shared order engine.
 *
 * @param {object} deps
 * @param {string} deps.projectId Firebase project id.
 * @param {() => Promise<string>} deps.getAccessToken OAuth2 bearer token provider.
 * @param {typeof fetch} [deps.fetchImpl] Injectable fetch (tests).
 * @param {string} [deps.emulatorHost] FIRESTORE_EMULATOR_HOST override.
 * @returns {{ collection: Function, runTransaction: Function }}
 */
export function createFirestore({ projectId, getAccessToken, fetchImpl = fetch, emulatorHost = null } = {}) {
  if (!projectId) throw new Error('createFirestore requires a projectId.');
  if (typeof getAccessToken !== 'function') {
    throw new Error('createFirestore requires a getAccessToken provider.');
  }

  const base = emulatorHost
    ? `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  // Canonical resource prefix used to build __name__ reference values.
  const documentsRoot = `projects/${projectId}/databases/(default)/documents`;

  async function request(path, { method = 'GET', query = null, body = null } = {}) {
    const url = new URL(`${base}${path}`);
    if (query) url.searchParams.set(query.name, query.value);

    const token = emulatorHost ? 'owner' : await getAccessToken();
    const res = await fetchImpl(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        // The Java-based emulator recycles idle keep-alive sockets in a way
        // that races undici's connection pool (ECONNRESET). One connection per
        // request avoids it; Google's production endpoint is unaffected.
        ...(emulatorHost ? { Connection: 'close' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    return { ok: res.ok, status: res.status, payload };
  }

  // Server error message for logs (the API client always receives a generic
  // response — see worker/src/app.js — so this only reaches logError).
  function serverError(hint, status, payload) {
    const msg = payload && payload.error && payload.error.message;
    return new Error(`${hint} (${status})${msg ? `: ${msg}` : ''}`);
  }

  async function runQuery(structuredQuery, parentPath, { transaction = null } = {}) {
    // Parent must be a document path (no trailing slash) so the RPC reads
    // `.../documents:runQuery` (root) or `.../documents/<parent>:runQuery`.
    const parent = parentPath ? `/${parentPath}` : '';
    const { ok, status, payload } = await request(`${parent}:runQuery`, {
      method: 'POST',
      body: { structuredQuery, ...(transaction ? { transaction } : {}) },
    });
    if (!ok) {
      throw serverError('Firestore runQuery failed', status, payload);
    }
    const rows = [];
    for (const entry of payload || []) {
      if (entry.document) rows.push(decodeDocument(entry.document));
    }
    return rows;
  }

  const db = {
    // Transactional document reads are served by POST :runQuery with an exact
    // __name__ equality filter inside the SAME transaction, not by the
    // documented GET ?transaction= contract: the Firestore emulator (jar
    // v1.22.0, pinned by firebase-tools 15.34.0) accepts that GET and then
    // never answers it (observed: hang → ECONNRESET), while RunQueryRequest
    // with the transaction set works and preserves the transaction's read
    // set, snapshot isolation, and commit-time conflict detection (verified
    // against the emulator). RunQueryRequest.transaction is part of the
    // official REST contract, so this path also serves production.
    async _getDocument(path, { transaction = null } = {}) {
      const segments = path.split('/');
      if (segments.length < 2) {
        throw new Error(`Invalid document path: ${path}`);
      }
      if (!transaction) {
        const { ok, status, payload } = await request(`/${path}`);
        if (ok) return decodeDocument(payload);
        if (status === 404) return null;
        throw serverError('Firestore get failed', status, payload);
      }

      const collectionId = segments[segments.length - 2];
      const parentPath = segments.slice(0, -2).join('/');
      const rows = await runQuery(
        {
          from: [{ collectionId, allDescendants: false }],
          where: {
            fieldFilter: {
              field: { fieldPath: '__name__' },
              op: 'EQUAL',
              value: { referenceValue: `${documentsRoot}/${path}` },
            },
          },
        },
        parentPath,
        { transaction }
      );
      return rows.length ? rows[0] : null;
    },
    _runQuery: runQuery,

    collection(name) {
      return new CollectionReference(db, name);
    },

    // Mirrors Admin-SDK runTransaction: reads inside the callback carry the
    // transaction id, staged writes are committed together, and an ABORTED
    // commit (a read document changed mid-flight) retries the whole callback
    // with fresh reads — the engine relies on this for concurrent-checkout
    // idempotency.
    async runTransaction(fn, { attempts = 5 } = {}) {
      let lastError = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const started = await request(':beginTransaction', {
          method: 'POST',
          body: { options: { readWrite: {} } },
        });
        if (!started.ok || !started.payload || !started.payload.transaction) {
          throw serverError('Firestore beginTransaction failed', started.status, started.payload);
        }
        const transaction = started.payload.transaction;

        const tx = new Transaction(db, transaction);
        const result = await fn(tx);

        if (!tx._staged.length) return result; // nothing to commit (validation failure path)

        const committed = await request(':commit', {
          method: 'POST',
          body: { transaction, writes: tx._staged.map((staged) => toWrite(staged, documentsRoot)) },
        });
        if (committed.ok) return result;

        lastError = serverError('Firestore commit failed', committed.status, committed.payload);
        // 409 ABORTED: a document read in this transaction changed before the
        // commit. Retry with fresh reads (Admin SDK does the same).
        if (committed.status !== 409) throw lastError;
      }
      throw lastError || new Error('Firestore transaction retries exhausted.');
    },
  };

  return db;
}
