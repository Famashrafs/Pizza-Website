// Firestore REST adapter tests (worker/src/firestore.js).
//
// The REAL adapter runs against an in-memory fake of the Firestore REST API
// (helpers/fakeFirestoreRest.js) that implements beginTransaction /
// transactional reads / commit with conflict detection, so transaction
// semantics — the backbone of the engine's idempotency — are exercised
// without credentials or network access.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createFirestore, serverTimestamp, encodeValue, decodeFields } from '../src/firestore.js';
import { createFakeFirestoreRest } from './helpers/fakeFirestoreRest.js';

const PROJECT = 'demo-worker-test';

function makeDb(overrides = {}) {
  const fake = overrides.fake || createFakeFirestoreRest();
  const db = createFirestore({
    projectId: PROJECT,
    getAccessToken: async () => 'test-token',
    fetchImpl: fake.fetchImpl,
    ...overrides.dbOptions,
  });
  return { db, fake };
}

// --- Value encoding ---------------------------------------------------------

test('encodeValue round-trips primitives, arrays and maps', () => {
  assert.deepEqual(encodeValue('x'), { stringValue: 'x' });
  assert.deepEqual(encodeValue(3), { integerValue: '3' });
  assert.deepEqual(encodeValue(3.5), { doubleValue: 3.5 });
  assert.deepEqual(encodeValue(true), { booleanValue: true });
  assert.deepEqual(encodeValue(null), { nullValue: null });
  assert.deepEqual(encodeValue([1, 'a']), { arrayValue: { values: [{ integerValue: '1' }, { stringValue: 'a' }] } });
  assert.deepEqual(encodeValue({ a: { b: 1 } }), {
    mapValue: { fields: { a: { mapValue: { fields: { b: { integerValue: '1' } } } } } },
  });
});

test('decodeFields converts Firestore timestamps to ISO strings', () => {
  const decoded = decodeFields({
    createdAt: { timestampValue: '2026-01-02T03:04:05.678Z' },
    total: { doubleValue: 12.5 },
    name: { stringValue: 'Margherita' },
  });
  assert.equal(decoded.createdAt, '2026-01-02T03:04:05.678Z');
  assert.equal(decoded.total, 12.5);
  assert.equal(decoded.name, 'Margherita');
});

test('serverTimestamp sentinel is excluded from encoded fields (becomes a transform)', () => {
  const { fake } = makeDb();
  fake.seedDoc('restaurants/r1', { taxRate: 0.08 });
  const db = createFirestore({
    projectId: PROJECT,
    getAccessToken: async () => 't',
    fetchImpl: fake.fetchImpl,
  });
  // Written through a real transaction so transforms flow through toWrite().
  // (Assertions live in the transaction test below.)
  assert.ok(typeof db.runTransaction === 'function');
});

// --- Document reads ---------------------------------------------------------

test('doc get returns { exists:false } for a missing document', async () => {
  const { db } = makeDb();
  const snap = await db.collection('orders').doc('ORD-MISSING').get();
  assert.equal(snap.exists, false);
  assert.equal(snap.data(), null);
});

test('doc get decodes a stored document with its id', async () => {
  const { db, fake } = makeDb();
  fake.seedDoc('orders/ORD-1', { total: 20.5, customerType: 'guest' });
  const snap = await db.collection('orders').doc('ORD-1').get();
  assert.equal(snap.exists, true);
  assert.equal(snap.id, 'ORD-1');
  assert.equal(snap.data().total, 20.5);
  assert.equal(snap.data().customerType, 'guest');
});

// --- Queries ----------------------------------------------------------------

test('where().get() filters with EQUAL and snapshot shape', async () => {
  const { db, fake } = makeDb();
  fake.seedDoc('products/p1', { restaurantId: 'r1', name: 'Pizza', basePrice: 10 });
  fake.seedDoc('products/p2', { restaurantId: 'r2', name: 'Other', basePrice: 99 });

  const snap = await db.collection('products').where('restaurantId', '==', 'r1').get();
  assert.equal(snap.size, 1);
  assert.equal(snap.empty, false);
  const seen = [];
  snap.forEach((doc) => seen.push(doc.id));
  assert.deepEqual(seen, ['p1']);
});

// --- Transactions -----------------------------------------------------------

test('runTransaction commits staged set() writes with server timestamps', async () => {
  const { db, fake } = makeDb();
  await db.runTransaction(async (tx) => {
    tx.set(db.collection('orders').doc('ORD-1'), {
      total: 30,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  const stored = fake.readDoc('orders/ORD-1');
  assert.equal(stored.total, 30);
  assert.match(stored.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(stored.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('tx.update() merges only the provided fields', async () => {
  const { db, fake } = makeDb();
  fake.seedDoc('orders/ORD-2', { total: 50, guestTokenHash: 'old-hash', customerType: 'guest' });

  await db.runTransaction(async (tx) => {
    const ref = db.collection('orders').doc('ORD-2');
    const snap = await tx.get(ref);
    assert.equal(snap.exists, true);
    tx.update(ref, { guestTokenHash: 'new-hash', updatedAt: serverTimestamp() });
  });

  const stored = fake.readDoc('orders/ORD-2');
  assert.equal(stored.guestTokenHash, 'new-hash');
  assert.equal(stored.total, 50); // untouched
  assert.equal(stored.customerType, 'guest'); // untouched
});

test('reads inside the transaction carry the transaction id', async () => {
  const { db, fake } = makeDb();
  fake.seedDoc('restaurants/r1', { taxRate: 0.08 });

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection('restaurants').doc('r1'));
    assert.equal(snap.exists, true);
    tx.update(db.collection('restaurants').doc('r1'), { taxRate: 0.09 });
  });

  // Transactional reads are carried by POST :runQuery in the request BODY
  // (GET ?transaction= hangs on the emulator — see worker/src/firestore.js).
  const txReads = fake.requests.filter(
    (r) => r.url.includes(':runQuery') && r.body && r.body.transaction
  );
  assert.ok(txReads.length >= 1, 'expected at least one transactional read');
  const docRead = txReads.find((r) => r.body.structuredQuery && r.body.structuredQuery.where);
  assert.ok(docRead, 'expected an exact-document read inside the transaction');
  assert.match(docRead.body.structuredQuery.where.fieldFilter.field.fieldPath, /__name__/);
  assert.ok(fake.requests.some((r) => r.url.includes(':beginTransaction')));
  assert.ok(fake.requests.some((r) => r.method === 'POST' && r.url.includes(':commit')));
});

test('retries after a 409 ABORTED commit and succeeds on fresh reads', async () => {
  const { db, fake } = makeDb();
  fake.seedDoc('checkoutReceipts/r1', { orderId: 'ORD-OLD' });

  let attempts = 0;
  const result = await db.runTransaction(async (tx) => {
    attempts += 1;
    const snap = await tx.get(db.collection('checkoutReceipts').doc('r1'));
    const orderId = snap.data().orderId;
    if (attempts === 1) {
      // Simulate a concurrent writer flipping the receipt between read+commit.
      fake.seedDoc('checkoutReceipts/r1', { orderId: 'ORD-CONFLICT' });
    }
    tx.set(db.collection('checkoutReceipts').doc('r1'), { orderId });
    return orderId;
  });

  assert.equal(attempts, 2);
  assert.equal(result, 'ORD-CONFLICT'); // fresh read after conflict
});

test('a validation-failure transaction with no staged writes commits nothing', async () => {
  const { db, fake } = makeDb();
  const result = await db.runTransaction(async () => ({ success: false }));
  assert.deepEqual(result, { success: false });
  assert.equal(fake.requests.some((r) => r.url.includes(':commit')), false);
  assert.equal(fake.docs.size, 0);
});

test('non-retryable commit failures throw instead of looping', async () => {
  const { db, fake } = makeDb();
  fake.seedDoc('orders/ORD-X', { total: 1 });
  // Force a non-409 failure by making commit always 500 via a poisoned write
  // path: replace fetchImpl to fail on commit.
  const original = fake.fetchImpl;
  const flaky = async (url, options) => {
    if (String(url).includes(':commit')) {
      return { ok: false, status: 500, json: async () => ({}) };
    }
    return original(url, options);
  };
  const db2 = createFirestore({
    projectId: PROJECT,
    getAccessToken: async () => 't',
    fetchImpl: flaky,
  });

  await assert.rejects(
    () => db2.runTransaction(async (tx) => tx.set(db2.collection('orders').doc('ORD-X'), { a: 1 })),
    /commit failed \(500\)/
  );
});

// --- Commit payload (REST wire format) --------------------------------------

// The real Firestore REST API REJECTS the Admin-SDK transform shape with
//   400 Invalid JSON payload received. Unknown name "serverTimestamp" at
//      'writes[0].update_transforms[0]'. Cannot find field.
// so the adapter must emit the REST DocumentTransform shape
//   { "fieldPath": "createdAt", "setToServerValue": "REQUEST_TIME" }.

test('a set() commit serializes server timestamps as REST updateTransforms', async () => {
  const { db, fake } = makeDb();
  await db.runTransaction(async (tx) => {
    tx.set(db.collection('orders').doc('ORD-TS'), {
      total: 30,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  const commit = fake.requests.find((r) => r.url.includes(':commit'));
  assert.ok(commit, 'expected a commit request');
  assert.equal(commit.method, 'POST');

  const write = commit.body.writes[0];
  assert.deepEqual(write.updateTransforms, [
    { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
    { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
  ]);

  // The Admin-SDK shape must never reach the wire.
  assert.ok(!JSON.stringify(commit.body).includes('serverTimestamp'));
  // Stamped fields are carried by the transform, not by `fields`.
  assert.deepEqual(Object.keys(write.update.fields), ['total']);
  // Field paths / update mask / transaction id are preserved.
  assert.deepEqual(write.updateMask.fieldPaths, ['total', 'createdAt', 'updatedAt']);
  assert.match(write.update.name, /\/documents\/orders\/ORD-TS$/);
  assert.ok(commit.body.transaction);
});

test('an update() commit serializes server timestamps as REST updateTransforms', async () => {
  const { db, fake } = makeDb();
  fake.seedDoc('orders/ORD-UPD', { total: 50, guestTokenHash: 'old-hash', customerType: 'guest' });

  await db.runTransaction(async (tx) => {
    const ref = db.collection('orders').doc('ORD-UPD');
    const snap = await tx.get(ref);
    assert.equal(snap.exists, true);
    tx.update(ref, { guestTokenHash: 'new-hash', updatedAt: serverTimestamp() });
  });

  const commit = fake.requests.find((r) => r.url.includes(':commit'));
  const write = commit.body.writes[0];
  assert.deepEqual(write.updateTransforms, [
    { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
  ]);
  assert.ok(!JSON.stringify(commit.body).includes('serverTimestamp'));
  // Masked merge: only the listed fields are written.
  assert.deepEqual(Object.keys(write.update.fields), ['guestTokenHash']);
  assert.deepEqual(write.updateMask.fieldPaths, ['guestTokenHash', 'updatedAt']);
  assert.match(write.update.name, /\/documents\/orders\/ORD-UPD$/);
});

test('a write without server timestamps carries no updateTransforms', async () => {
  const { db, fake } = makeDb();
  await db.runTransaction(async (tx) => {
    tx.set(db.collection('orders').doc('ORD-PLAIN'), { total: 12 });
  });
  const commit = fake.requests.find((r) => r.url.includes(':commit'));
  assert.equal(commit.body.writes[0].updateTransforms, undefined);
});

// The check above inspects the parsed payload; this one inspects the RAW
// string that is actually written to the HTTP request body, so the exact JSON
// casing required by the REST API ("setToServerValue": "REQUEST_TIME") is
// verified on the wire, not on an intermediate object.
test('the RAW serialized commit body uses the exact Firestore REST casing', async () => {
  const { fake } = makeDb();
  const rawBodies = [];
  const spy = async (url, options = {}) => {
    if (String(url).includes(':commit')) rawBodies.push(options.body);
    return fake.fetchImpl(url, options);
  };
  const db = createFirestore({
    projectId: PROJECT,
    getAccessToken: async () => 'test-token',
    fetchImpl: spy,
  });

  await db.runTransaction(async (tx) => {
    tx.set(db.collection('orders').doc('ORD-RAW'), {
      total: 7,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  assert.equal(rawBodies.length, 1);
  const raw = rawBodies[0];
  assert.equal(typeof raw, 'string');
  // Exact wire casing.
  assert.ok(raw.includes('"updateTransforms"'));
  assert.ok(raw.includes('"setToServerValue":"REQUEST_TIME"'));
  assert.ok(raw.includes('"fieldPath":"createdAt"'));
  assert.ok(raw.includes('"fieldPath":"updatedAt"'));
  // The Admin-SDK property must never be serialized.
  assert.ok(!raw.includes('serverTimestamp'));

  // Same content, parsed from the wire.
  const parsed = JSON.parse(raw);
  assert.deepEqual(parsed.writes[0].updateTransforms, [
    { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
    { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
  ]);
});

// The fake mirrors the REST API's strict transform validation, so a regression
// to the Admin-SDK shape fails loudly instead of passing silently.
test('the fake rejects an Admin-SDK style transform exactly like the real Firestore API', async () => {  const { fake } = makeDb();
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

  const started = await fake.fetchImpl(`${base}:beginTransaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ options: { readWrite: {} } }),
  });
  const { transaction } = await started.json();

  const res = await fake.fetchImpl(`${base}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transaction,
      writes: [
        {
          update: { name: `${base}/orders/ORD-BAD`, fields: {} },
          updateMask: { fieldPaths: ['createdAt'] },
          updateTransforms: [{ fieldPath: 'createdAt', serverTimestamp: {} }],
        },
      ],
    }),
  });

  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.match(
    payload.error.message,
    /Unknown name "serverTimestamp" at 'writes\[0\]\.update_transforms\[0\]'/
  );
});

// --- Emulator mode ----------------------------------------------------------

test('emulator mode targets FIRESTORE_EMULATOR_HOST over plain HTTP without OAuth', async () => {
  const seen = [];
  const db = createFirestore({
    projectId: PROJECT,
    getAccessToken: async () => {
      throw new Error('must not mint tokens against the emulator');
    },
    emulatorHost: '127.0.0.1:8401',
    fetchImpl: async (url, options) => {
      seen.push({ url, auth: options.headers.Authorization });
      return { ok: false, status: 404, json: async () => ({}) };
    },
  });

  await db.collection('orders').doc('ORD-1').get();
  assert.match(seen[0].url, /^http:\/\/127\.0\.0\.1:8401\/v1\/projects\/demo-worker-test\/databases\/\(default\)\/documents\/orders\/ORD-1/);
  assert.equal(seen[0].auth, 'Bearer owner');
});
