// Standalone repro: sequential raw fetches against the emulator, with timing.
const host = process.env.FIRESTORE_EMULATOR_HOST;
console.log('host =', host);

const base = `http://${host}/v1/projects/demo-worker-test/databases/(default)/documents`;

async function call(label, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(`${Date.now() - t0}ms ${label} -> ${r}`);
    return true;
  } catch (err) {
    let chain = '';
    for (let c = err; c; c = c.cause) chain += ` | ${c.code || ''} ${c.message || c}`;
    console.log(`${Date.now() - t0}ms ${label} FAILED${chain}`);
    return false;
  }
}

await call('PATCH restaurants/r1', async () => {
  const res = await fetch(`${base}/restaurants/r1`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify({ fields: { taxRate: { doubleValue: 0.08 } } }),
  });
  return `${res.status}`;
});

await call('PATCH products/p1', async () => {
  const res = await fetch(`${base}/products/p1`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify({ fields: { name: { stringValue: 'Margherita' }, available: { booleanValue: true } } }),
  });
  return `${res.status}`;
});

await call('beginTransaction', async () => {
  const res = await fetch(`${base}:beginTransaction`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify({ options: { readWrite: {} } }),
  });
  const body = await res.json();
  return `${res.status} tx=${body.transaction || JSON.stringify(body)}`;
});

await call('GET restaurants/r1', async () => {
  const res = await fetch(`${base}/restaurants/r1`, {
    headers: { Authorization: 'Bearer owner', Connection: 'close' },
  });
  return `${res.status}`;
});

await call('runQuery', async () => {
  const res = await fetch(`${base}:runQuery`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'products', allDescendants: false }], where: { fieldFilter: { field: { fieldPath: 'name' }, op: 'EQUAL', value: { stringValue: 'Margherita' } } } } }),
  });
  const body = await res.json();
  return `${res.status} rows=${Array.isArray(body) ? body.length : JSON.stringify(body)}`;
});

await call('PATCH again (after delay)', async () => {
  await new Promise((r) => setTimeout(r, 500));
  const res = await fetch(`${base}/restaurants/r1`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify({ minOrder: { integerValue: '0' } }),
  });
  return `${res.status}`;
});
