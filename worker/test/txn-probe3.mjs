// Temporary diagnostic (Step 1, v3): bisect the rejected commit payload.
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) { console.error('FIRESTORE_EMULATOR_HOST not set'); process.exit(1); }
import { readFileSync } from 'node:fs';

const PROJECT = 'demo-worker-test';
const root = `http://${host}/v1/projects/${PROJECT}/databases/(default)/documents`;
const auth = { Authorization: 'Bearer owner', 'Content-Type': 'application/json', Connection: 'close' };

const captured = JSON.parse(readFileSync(new URL('./rejected-commit.json', import.meta.url), 'utf8').replace(/^﻿/, ''));
const receiptWrite = captured.writes[0];
const orderWrite = captured.writes[1];

const beginTx = async () => {
  const res = await fetch(`${root}:beginTransaction`, {
    method: 'POST', headers: auth, body: JSON.stringify({ options: { readWrite: {} } }),
  });
  const body = await res.json();
  if (!res.ok || !body.transaction) throw new Error(`begin ${res.status}`);
  return body.transaction;
};

const tryCommit = async (label, write) => {
  const tx = await beginTx();
  const res = await fetch(`${root}:commit`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ transaction: tx, writes: [write] }),
  });
  const body = await res.json().catch(() => ({}));
  const msg = body.error && body.error.message;
  console.log(`${res.ok ? 'PASS' : 'FAIL'} ${label} -> ${res.status}${msg ? ` ${msg}` : ''}`);
  return res.ok;
};

// 1) Each captured write verbatim.
await tryCommit('receipt verbatim (mask+transform)', receiptWrite);
await tryCommit('order verbatim (mask+2 transforms)', orderWrite);

// 2) Receipt without updateTransforms.
const { updateTransforms: _r, ...receiptNoTf } = receiptWrite;
await tryCommit('receipt without updateTransforms', receiptNoTf);

// 3) Receipt whose mask does NOT list the transform-only field.
const receiptMaskNoTs = {
  ...receiptWrite,
  updateMask: { fieldPaths: receiptWrite.updateMask.fieldPaths.filter((p) => p !== 'createdAt') },
};
await tryCommit('receipt mask minus createdAt', receiptMaskNoTs);

// 4) Receipt without updateMask (full-replace set).
const { updateMask: _m, ...receiptNoMask } = receiptWrite;
await tryCommit('receipt without updateMask', receiptNoMask);

// 5) Transform value as null instead of {}.
await tryCommit('receipt with serverTimestamp:null', {
  ...receiptWrite,
  updateTransforms: [{ fieldPath: 'createdAt', serverTimestamp: null }],
});

// 6) Minimal control: plain write, mask, no transform.
await tryCommit('CONTROL plain write + mask', {
  update: { name: `projects/${PROJECT}/databases/(default)/documents/controlDoc`, fields: { a: { stringValue: 'b' } } },
  updateMask: { fieldPaths: ['a'] },
});

// 7) Minimal transform case: one normal field + one serverTimestamp field.
await tryCommit('CONTROL + serverTimestamp transform', {
  update: {
    name: `projects/${PROJECT}/databases/(default)/documents/controlDoc2`,
    fields: { a: { stringValue: 'b' }, ts: { stringValue: 'ignored' } },
  },
  updateMask: { fieldPaths: ['a', 'ts'] },
  updateTransforms: [{ fieldPath: 'ts', serverTimestamp: {} }],
});

// 8) Transform-only field NOT present in fields, mask lists it.
await tryCommit('CONTROL transform key absent from fields', {
  update: {
    name: `projects/${PROJECT}/databases/(default)/documents/controlDoc3`,
    fields: { a: { stringValue: 'b' } },
  },
  updateMask: { fieldPaths: ['a', 'ts'] },
  updateTransforms: [{ fieldPath: 'ts', serverTimestamp: {} }],
});
