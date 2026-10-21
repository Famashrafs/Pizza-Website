// Temporary diagnostic (Step 1, v2): exact-doc runQuery filtering, snapshot
// isolation, and commit-time conflict detection under a concurrent writer tx.
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) { console.error('FIRESTORE_EMULATOR_HOST not set'); process.exit(1); }

const PROJECT = 'demo-worker-test';
const root = `http://${host}/v1/projects/${PROJECT}/databases/(default)/documents`;
const fullName = `projects/${PROJECT}/databases/(default)/documents`;
const auth = { Authorization: 'Bearer owner', 'Content-Type': 'application/json', Connection: 'close' };
const plain = (v) => (v && typeof v === 'object' && 'stringValue' in v ? v.stringValue : v);

const timed = async (label, ms, fn) => {
  const t0 = Date.now();
  try {
    const out = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT after ${ms}ms`)), ms)),
    ]);
    console.log(`PASS ${label} (${Date.now() - t0}ms) ->`, JSON.stringify(out));
    return { ok: true, out };
  } catch (err) {
    let extra = '';
    for (let c = err; c; c = c.cause) extra += ` | ${c.code || ''} ${c.message || c}`;
    console.log(`FAIL ${label} (${Date.now() - t0}ms)${extra}`);
    return { ok: false, err };
  }
};

const beginTx = async () => {
  const res = await fetch(`${root}:beginTransaction`, {
    method: 'POST', headers: auth, body: JSON.stringify({ options: { readWrite: {} } }),
  });
  const body = await res.json();
  if (!res.ok || !body.transaction) throw new Error(`begin ${res.status}`);
  return body.transaction;
};

const getDocTx = (tx, path) =>
  fetch(`${root}:runQuery`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      transaction: tx,
      structuredQuery: {
        from: [{ collectionId: path.split('/')[0], allDescendants: false }],
        where: { fieldFilter: { field: { fieldPath: '__name__' }, op: 'EQUAL', value: { referenceValue: `${fullName}/${path}` } } },
      },
    }),
  }).then(async (res) => {
    const body = await res.json();
    if (!res.ok) throw new Error(`runQuery ${res.status} ${JSON.stringify(body)}`);
    const docs = body.filter((e) => e.document);
    return { raw: body.length, docs: docs.length, marker: docs[0] && plain(docs[0].document.fields.marker) };
  });

const beginAll = async () => {
  await fetch(`${root}/restaurants/r1`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ fields: { marker: { stringValue: 'v1' }, taxRate: { doubleValue: 0.08 } } }),
  });
  await fetch(`${root}/restaurants/r2`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ fields: { marker: { stringValue: 'r2' } } }),
  });
};
await beginAll();

// A) Exact-doc filter with TWO docs in the collection.
let tx1;
await timed('A1 beginTx1', 5000, async () => { tx1 = await beginTx(); return tx1; });
await timed('A2 runQuery(tx1) r1 exact → 1 doc, marker v1 (not r2)', 8000, async () => {
  const r = await getDocTx(tx1, 'restaurants/r1');
  if (r.docs !== 1 || r.marker !== 'v1') throw new Error(`got ${JSON.stringify(r)}`);
  return r;
});
await timed('A3 runQuery(tx1) missing order → 0 document rows', 8000, async () => {
  const r = await getDocTx(tx1, 'orders/ORD-MISSING');
  if (r.docs !== 0) throw new Error(`got ${JSON.stringify(r)}`);
  return r;
});

// B) Concurrent writer tx2 commits while tx1 open (engine's real pattern).
let tx2;
await timed('B1 beginTx2 (concurrent writer)', 5000, async () => { tx2 = await beginTx(); return tx2; });
await timed('B2 tx2 reads r1', 8000, async () => getDocTx(tx2, 'restaurants/r1'));
await timed('B3 tx2 commits r1 → marker v2, expect 200', 8000, async () => {
  const res = await fetch(`${root}:commit`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      transaction: tx2,
      writes: [{
        update: { name: `${fullName}/restaurants/r1`, fields: { marker: { stringValue: 'v2' } } },
        updateMask: { fieldPaths: ['marker'] },
      }],
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`commit ${res.status} ${JSON.stringify(body)}`);
  return { status: res.status };
});

// C) tx1 (which read r1 BEFORE tx2's write) now commits → conflict expected.
await timed('C1 tx1 re-read after tx2 commit → isolation: still v1?', 8000, async () => {
  const r = await getDocTx(tx1, 'restaurants/r1');
  return { marker: r.marker };
});
await timed('C2 tx1 commits r1 → expect 409 ABORTED (read-set conflict)', 8000, async () => {
  const res = await fetch(`${root}:commit`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      transaction: tx1,
      writes: [{
        update: { name: `${fullName}/restaurants/r1`, fields: { taxRate: { doubleValue: 0.1 } } },
        updateMask: { fieldPaths: ['taxRate'] },
      }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 409) throw new Error(`expected 409, got ${res.status} ${JSON.stringify(body)}`);
  return { status: res.status, body };
});

// D) Plain non-transactional GET still works after all this.
await timed('D1 non-transactional GET r1', 5000, async () => {
  const res = await fetch(`${root}/restaurants/r1`, { headers: auth });
  const body = await res.json();
  if (!res.ok) throw new Error(`get ${res.status}`);
  return { marker: plain(body.fields.marker) };
});
