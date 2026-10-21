// Temporary diagnostic: run inside `firebase emulators:exec`.
import { createFirestore, serverTimestamp } from '../src/firestore.js';

const host = process.env.FIRESTORE_EMULATOR_HOST;
console.log('FIRESTORE_EMULATOR_HOST =', JSON.stringify(host));
console.log('GCLOUD_PROJECT =', JSON.stringify(process.env.GCLOUD_PROJECT));

if (!host) {
  console.error('NO EMULATOR HOST');
  process.exit(1);
}

const show = (label, err) => {
  console.log(`--- ${label} ---`);
  console.log('message:', err && err.message);
  for (let c = err && err.cause; c; c = c.cause) {
    console.log('cause:', c.constructor && c.constructor.name, '|', c.code || '', '|', c.message || String(c));
  }
};

// 1. Raw fetch, no keep-alive reuse.
try {
  const res = await fetch(
    `http://${host}/v1/projects/demo-worker-test/databases/(default)/documents/probe-doc`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { a: { stringValue: 'b' } } }),
      keepalive: false,
    }
  );
  console.log('raw PATCH:', res.status, await res.text());
} catch (err) {
  show('raw PATCH failed', err);
}

// 2. Adapter: beginTransaction only.
const db = createFirestore({
  projectId: 'demo-worker-test',
  getAccessToken: async () => 'owner',
  emulatorHost: host,
});
try {
  const snap = await db.collection('probe-doc').get();
  console.log('adapter doc get: exists =', snap.exists, 'data =', JSON.stringify(snap.data()));
} catch (err) {
  show('adapter get failed', err);
}

try {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection('probe-doc'));
    console.log('tx read: exists =', snap.exists);
    tx.set(db.collection('probe-doc'), { b: { ...serverTimestamp() } });
  });
  console.log('transaction committed');
} catch (err) {
  show('transaction failed', err);
}
