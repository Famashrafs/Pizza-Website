// In-memory Firestore mock used by unit tests. It implements the exact public
// API of `src/services/db.js` (see that file) so service code never branches
// for tests. Writes that carry a `serversNow()` sentinel are materialized as a
// real Date, mirroring how Cloud Firestore turns `serverTimestamp()` into a
// `Timestamp` — and `timestampToISO()` then renders it the same way the SDK
// path would.
//
// Usage in a test:
//   jest.mock('./db');           // or './services/db' from outside src/services
//   const db = require('./db');  // auto-resolves to this manual mock

const store = new Map();
const listeners = new Map();

const NOW = new Date('2025-01-01T00:00:00.000Z');

function hydrateSentinel(value) {
  if (value && value.__serversNow) return new Date(NOW);
  if (Array.isArray(value)) return value.map(hydrateSentinel);
  if (value && typeof value === 'object') {
    const next = {};
    for (const key of Object.keys(value)) next[key] = hydrateSentinel(value[key]);
    return next;
  }
  return value;
}

function clone(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    const next = {};
    for (const key of Object.keys(value)) next[key] = clone(value[key]);
    return next;
  }
  return value;
}

function collectionEntries(path) {
  const prefix = `${path}/`;
  const out = [];
  store.forEach((entry, key) => {
    if (key.startsWith(prefix)) out.push(clone({ id: entry.id, ...entry.data }));
  });
  return out;
}

function matches(doc, clauses) {
  return (clauses || []).every(({ field, op, value }) => {
    switch (op) {
      case '==':
        return doc[field] === value;
      case 'in':
        return Array.isArray(value) && value.includes(doc[field]);
      case 'array-contains':
        return Array.isArray(doc[field]) && doc[field].includes(value);
      default:
        throw new Error(`Unsupported mock where operator: ${op}`);
    }
  });
}

function applyQuery(entries, { where: clauses = [], orderBy: order = [], limit: max = null } = {}) {
  let result = entries.filter((entry) => matches(entry, clauses));
  (order || []).forEach(({ field, dir = 'asc' }) => {
    const factor = dir === 'desc' ? -1 : 1;
    result = result.sort((a, b) => {
      if (a[field] == null && b[field] == null) return 0;
      if (a[field] == null) return 1;
      if (b[field] == null) return -1;
      return a[field] < b[field] ? -1 * factor : a[field] > b[field] ? 1 * factor : 0;
    });
  });
  if (max != null && max > 0) result = result.slice(0, max);
  return result;
}

function notify(collectionPath) {
  const set = listeners.get(collectionPath);
  if (!set) return;
  Array.from(set).forEach((cb) => {
    try {
      cb();
    } catch (err) {
      // A broken subscriber must never break the writer.
    }
  });
}

export async function getDoc(path) {
  const entry = store.get(path);
  return entry ? clone({ id: entry.id, ...entry.data }) : null;
}

export async function getDocs(collectionPath, queryOptions = {}) {
  return applyQuery(collectionEntries(collectionPath), queryOptions).map(clone);
}

export async function setDoc(path, data, merge = false) {
  const existing = store.get(path);
  const next = { ...(merge && existing ? existing : {}), ...hydrateSentinel(clone(data)) };
  if (!merge || existing) next.id = existing ? existing.id : path.split('/').pop();
  else next.id = path.split('/').pop();
  delete next.id; // id is derived from the path, like Firestore
  store.set(path, { id: path.split('/').pop(), data: next });
  notify(path.split('/').slice(0, -1).join('/'));
  return { ...next, id: path.split('/').pop() };
}

export async function addDoc(collectionPath, data) {
  const id = `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const path = `${collectionPath}/${id}`;
  const normalized = hydrateSentinel(clone(data));
  store.set(path, { id, data: normalized });
  notify(collectionPath);
  return { ...normalized, id };
}

export async function updateDoc(path, patch) {
  const existing = store.get(path);
  if (!existing) throw new Error(`Mock Firestore: doc ${path} does not exist.`);
  const next = { ...existing.data, ...hydrateSentinel(clone(patch)) };
  store.set(path, { id: existing.id, data: next });
  notify(path.split('/').slice(0, -1).join('/'));
  return existing.id;
}

export async function deleteDoc(path) {
  store.delete(path);
  notify(path.split('/').slice(0, -1).join('/'));
  return path.split('/').pop();
}

export function subscribe(collectionPath, _queryOptions = {}, callback) {
  if (!listeners.has(collectionPath)) listeners.set(collectionPath, new Set());
  const set = listeners.get(collectionPath);
  set.add(callback);
  return () => set.delete(callback);
}

// --- Timestamp helpers (mirror db.js) ---------------------------------------

export const serversNow = () => ({ __serversNow: true });

export const nowISO = () => new Date().toISOString();

export function timestampToISO(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return value;
}

// --- Test helpers (not part of db.js) ---------------------------------------

export function __reset() {
  store.clear();
  listeners.clear();
}

export function __setDocs(entries) {
  Object.entries(entries).forEach(([path, data]) => {
    store.set(path, { id: path.split('/').pop(), data: clone(data) });
  });
}

export function __getDocs() {
  const out = {};
  store.forEach((entry, key) => {
    out[key] = clone(entry.data);
  });
  return out;
}

const mockDb = {
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  subscribe,
  serversNow,
  nowISO,
  timestampToISO,
  __reset,
  __setDocs,
  __getDocs,
};

export default mockDb;