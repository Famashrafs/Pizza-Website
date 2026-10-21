// Temporary diagnostic (Step 1): isolate the emulator's behavior for
// transactional document reads. Run via:
//   npx firebase emulators:exec --config firebase.emulator.json \
//     --project demo-worker-test --only firestore "node worker/test/txn-probe.mjs"
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) { console.error('FIRESTORE_EMULATOR_HOST not set'); process.exit(1); }

const PROJECT = 'demo-worker-test';
const root = `http://${host}/v1/projects/${PROJECT}/databases/(default)/documents`;
const fullName = `projects/${PROJECT}/databases/(default)/documents`;
const auth = { Authorization: 'Bearer owner', 'Content-Type': 'application/json', Connection: 'close' };

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
    return { ok: false };
  }
};

// Seed v1.
await timed('seed PATCH', 5000, async () => {
  const res = await fetch(`${root}/restaurants/r1`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ fields: { taxRate: { doubleValue: 0.08 }, marker: { stringValue: 'v1' } } }),
  });
  if (!res.ok) throw new Error(`seed ${res.status}`);
  return 'ok';
});

// A) beginTransaction.
let tx = null;
{
  const r = await timed('beginTransaction', 5000, async () => {
    const res = await fetch(`${root}:beginTransaction`, {
      method: 'POST', headers: auth, body: JSON.stringify({ options: { readWrite: {} } }),
    });
    const body = await res.json();
    if (!res.ok || !body.transaction) throw new Error(`begin ${res.status} ${JSON.stringify(body)}`);
    tx = body.transaction;
    return tx;
  });
  if (!r.ok) process.exit(1);
}

// B) Documented contract: GET + ?transaction=  (the hypothesis under test).
await timed('GET doc + ?transaction= (official REST contract)', 8000, async () => {
  const res = await fetch(
    `${root}/restaurants/r1?transaction=${encodeURIComponent(tx)}`,
    { headers: auth }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`get ${res.status} ${JSON.stringify(body)}`);
  return { marker: body.fields && body.fields.marker };
});

// C) Transaction-bound POST :runQuery targeting the EXACT document via __name__.
const runQueryTx = (t) =>
  fetch(`${root}:runQuery`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      transaction: t,
      structuredQuery: {
        from: [{ collectionId: 'restaurants', allDescendants: false }],
        where: { fieldFilter: { field: { fieldPath: '__name__' }, op: 'EQUAL', value: { referenceValue: `${fullName}/restaurants/r1` } } },
      },
    }),
  });

await timed('runQuery(tx) __name__==referenceValue, doc exists', 8000, async () => {
  const res = await runQueryTx(tx);
  const body = await res.json();
  if (!res.ok) throw new Error(`runQuery ${res.status} ${JSON.stringify(body)}`);
  return { rows: body.length, marker: body[0] && body[0].document.fields.marker };
});

// D) runQuery(tx) for a MISSING document → empty (null semantics).
await timed('runQuery(tx) __name__==referenceValue, doc missing', 8000, async () => {
  const res = await fetch(`${root}:runQuery`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      transaction: tx,
      structuredQuery: {
        from: [{ collectionId: 'orders', allDescendants: false }],
        where: { fieldFilter: { field: { fieldPath: '__name__' }, op: 'EQUAL', value: { referenceValue: `${fullName}/orders/ORD-MISSING` } } },
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`runQuery ${res.status} ${JSON.stringify(body)}`);
  return { rows: body.length };
});

// E) Isolation: modify the doc OUTSIDE the tx → tx read must still see v1.
await timed('external write (outside tx)', 5000, async () => {
  const res = await fetch(`${root}/restaurants/r1`, {
    method: 'PATCH', headers: auth,
    body: JSON.stringify({ fields: { marker: { stringValue: 'v2' } } }),
  });
  if (!res.ok) throw new Error(`patch ${res.status}`);
  return 'ok';
});

await timed('runQuery(tx) again → must still read v1 (snapshot isolation)', 8000, async () => {
  const res = await runQueryTx(tx);
  const body = await res.json();
  if (!res.ok) throw new Error(`runQuery ${res.status} ${JSON.stringify(body)}`);
  const marker = body[0] && body[0].document.fields.marker;
  if (marker !== 'v1') throw new Error(`ISOLATION VIOLATED: read ${JSON.stringify(marker)}`);
  return { marker };
});

// F) Commit a write to the doc read in tx, after the external write → 409 ABORTED?
await timed('commit after external conflict → expect 409 ABORTED', 8000, async () => {
  const res = await fetch(`${root}:commit`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      transaction: tx,
      writes: [{
        update: { name: `${fullName}/restaurants/r1`, fields: { taxRate: { doubleValue: 0.1 } } },
        updateMask: { fieldPaths: ['taxRate'] },
      }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
});
