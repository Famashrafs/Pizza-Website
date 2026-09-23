// Thin, deliberately small Firestore access layer.
//
// Every service in `src/services` talks to the database only through this
// module. Keeping the surface tiny gives us three things:
//
//   1. The whole app depends on the real SDK profile (`firebase/firestore`)
//      while the API stays generic (string paths, plain objects), so services
//      read like the localStorage services they replace.
//   2. Timestamp handling is centralized: we always write `serverTimestamp()`
//      and convert Firestore `Timestamp` values back to ISO strings when
//      reading, so the UI never has to know about `Timestamp` objects.
//   3. Tests plug in `src/services/__mocks__/db.js` (in-memory) with the exact
//      same API — no service code has to branch for tests.

import {
  getFirestore,
  collection as fsCollection,
  doc as fsDoc,
  getDoc as fsGetDoc,
  getDocs as fsGetDocs,
  setDoc as fsSetDoc,
  addDoc as fsAddDoc,
  updateDoc as fsUpdateDoc,
  deleteDoc as fsDeleteDoc,
  query as fsQuery,
  where as fsWhere,
  orderBy as fsOrderBy,
  limit as fsLimit,
  onSnapshot as fsOnSnapshot,
  serverTimestamp as fsServerTimestamp,
} from 'firebase/firestore';
import app from '../firebase';

let dbInstance = null;

function getDB() {
  if (!dbInstance) dbInstance = getFirestore(app);
  return dbInstance;
}

function parseWhere(clause) {
  switch (clause.op) {
    case '==':
      return fsWhere(clause.field, '==', clause.value);
    case 'array-contains':
      return fsWhere(clause.field, 'array-contains', clause.value);
    case 'in':
      return fsWhere(clause.field, 'in', clause.value);
    default:
      throw new Error(`Unsupported Firestore where operator: ${clause.op}`);
  }
}

function buildQuery(collectionPath, { where: clauses = [], orderBy: order = [], limit: max = null } = {}) {
  let ref = fsCollection(getDB(), collectionPath);
  const constraints = [];
  clauses.forEach((clause) => constraints.push(parseWhere(clause)));
  order.forEach(({ field, dir = 'asc' }) => constraints.push(fsOrderBy(field, dir)));
  if (max != null && max > 0) constraints.push(fsLimit(max));
  return constraints.length ? fsQuery(ref, ...constraints) : ref;
}

// Returns a plain object (id included) for a document, or null when missing.
export async function getDoc(path) {
  const snapshot = await fsGetDoc(fsDoc(getDB(), path));
  if (!snapshot.exists()) return null;
  return { ...snapshot.data(), id: snapshot.id };
}

// Returns an array of plain objects for a collection query.
export async function getDocs(collectionPath, queryOptions = {}) {
  const snapshot = await fsGetDocs(buildQuery(collectionPath, queryOptions));
  return snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export async function setDoc(path, data, merge = false) {
  const ref = fsDoc(getDB(), path);
  await fsSetDoc(ref, data, merge ? { merge: true } : {});
  return { ...data, id: path.split('/').pop() };
}

export async function addDoc(collectionPath, data) {
  const ref = await fsAddDoc(fsCollection(getDB(), collectionPath), data);
  return { ...data, id: ref.id };
}

export async function updateDoc(path, patch) {
  await fsUpdateDoc(fsDoc(getDB(), path), patch);
  return path.split('/').pop();
}

export async function deleteDoc(path) {
  await fsDeleteDoc(fsDoc(getDB(), path));
  return path.split('/').pop();
}

// Real-time listener. `callback` is invoked with the current docs whenever the
// matching set changes; returns an unsubscribe function. Callers use it to
// trigger a reload of a loader, never to cache data.
export function subscribe(collectionPath, queryOptions = {}, callback) {
  let active = true;
  const unsub = fsOnSnapshot(
    buildQuery(collectionPath, queryOptions),
    () => {
      if (active) callback();
    },
    () => {
      if (active) callback();
    }
  );
  return () => {
    active = false;
    try {
      unsub();
    } catch (err) {
      /* already unsubscribed */
    }
  };
}

// --- Timestamp helpers -------------------------------------------------------

// Server-set timestamp used for writes (never for display).
export const serversNow = () => fsServerTimestamp();

export const nowISO = () => new Date().toISOString();

// Converts Firestore Timestamp values (and Date strings) into ISO strings so
// the UI can always `new Date(value)`. Returns the input unchanged for values
// it cannot interpret.
export function timestampToISO(value) {
  if (value == null) return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

const db = {
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
};

export default db;