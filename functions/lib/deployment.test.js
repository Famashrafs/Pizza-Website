// Deployment-configuration tests for the `createOrder` / `getGuestOrder`
// callables. They read the REAL deployment artifacts — `firebase.json`,
// `.firebaserc`, `functions/package.json` and `functions/index.js` — so a
// missing or wrong deploy target fails the build instead of surfacing later as
// a browser CORS error on a 404 endpoint.
//
// Run: npm run test:functions
//
// Live check (opt-in, needs network + a real deployment):
//   FUNCTION_LIVE_CHECK=1 npm run test:functions

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

test('firebase.json declares the functions source that actually exists', () => {
  const config = readJson('firebase.json');

  assert.ok(config.functions, 'firebase.json has no "functions" block — the CLI cannot deploy functions/ without it');
  assert.equal(config.functions.source, 'functions', 'functions source must be the existing functions/ directory');

  const sourceDir = path.join(repoRoot, config.functions.source);
  assert.ok(fs.existsSync(sourceDir), `functions source directory missing: ${config.functions.source}`);

  const pkg = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf8'));
  assert.equal(pkg.main, 'index.js', 'functions entry point must be index.js');
  assert.ok(
    fs.existsSync(path.join(sourceDir, pkg.main)),
    `functions entry file missing: ${config.functions.source}/${pkg.main}`
  );
});

test('firestore configuration is preserved next to the functions block', () => {
  const config = readJson('firebase.json');

  assert.ok(config.firestore, 'firestore block disappeared from firebase.json');
  assert.equal(config.firestore.rules, 'firestore.rules');
  assert.equal(config.firestore.indexes, 'firestore.indexes.json');
  assert.ok(fs.existsSync(path.join(repoRoot, config.firestore.rules)));
  assert.ok(fs.existsSync(path.join(repoRoot, config.firestore.indexes)));
});

test('deploy target project matches .firebaserc default', () => {
  const config = readJson('firebase.json');
  const rc = readJson('.firebaserc');

  assert.ok(rc.projects && rc.projects.default, '.firebaserc has no default project');
  assert.equal(rc.projects.default, 'resturent-system');
  assert.ok(config.functions, 'no functions codebase for project ' + rc.projects.default);
});

test('both exports are v2 callables, not HTTP functions, in the default region', () => {
  const src = read('functions/index.js');

  assert.match(src, /require\(['"]firebase-functions\/v2\/https['"]\)/, 'must use firebase-functions v2 https');
  assert.match(src, /exports\.createOrder\s*=\s*onCall\(/, 'createOrder must be exported with onCall');
  assert.match(src, /exports\.getGuestOrder\s*=\s*onCall\(/, 'getGuestOrder must be exported with onCall');
  assert.doesNotMatch(src, /onRequest\s*\(/, 'onRequest would not speak the callable protocol');
  // The client calls getFunctions(app) with no explicit region, so the
  // backend must keep the shared default (us-central1).
  assert.doesNotMatch(src, /\.region\(/, 'pinned region would break the client default (us-central1)');
  assert.doesNotMatch(src, /setGlobalOptions\s*\(/, 'global options must not pin a non-default region');
});

test('runtime and dependencies match the callable implementation', () => {
  const pkg = JSON.parse(read('functions/package.json'));

  assert.equal(pkg.engines && pkg.engines.node, '20', 'functions runtime must declare node 20');
  const functionsVersion = (pkg.dependencies && pkg.dependencies['firebase-functions']) || '';
  assert.ok(
    parseFloat(functionsVersion.replace(/^[^\d]*/, '')) >= 5,
    `firebase-functions must be v2-capable (>=5), found "${functionsVersion}"`
  );
  assert.ok(pkg.dependencies['firebase-admin'], 'firebase-admin is required by the callable');
});

test('opt-in: the deployed endpoints answer the browser preflight', { skip: !process.env.FUNCTION_LIVE_CHECK }, async () => {
  const rc = readJson('.firebaserc');
  const project = process.env.FIREBASE_PROJECT_ID || rc.projects.default;
  const origin = 'http://localhost:3000';

  for (const name of ['createOrder', 'getGuestOrder']) {
    const url = `https://us-central1-${project}.cloudfunctions.net/${name}`;

    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
      signal: AbortSignal.timeout(15000),
    });
    assert.notEqual(preflight.status, 404, `${name} is not deployed in ${project} (404)`);
    assert.ok(
      preflight.headers.get('access-control-allow-origin'),
      `${name}: preflight has no Access-Control-Allow-Origin (status ${preflight.status})`
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ data: {} }),
      signal: AbortSignal.timeout(15000),
    });
    assert.notEqual(response.status, 404, `${name} is not deployed in ${project} (404)`);
    assert.ok(
      response.headers.get('access-control-allow-origin'),
      `${name}: response has no Access-Control-Allow-Origin (status ${response.status})`
    );
    const body = await response.json();
    assert.ok(
      Object.prototype.hasOwnProperty.call(body, 'result') ||
        Object.prototype.hasOwnProperty.call(body, 'error'),
      `${name}: response is not a callable envelope: ${JSON.stringify(body).slice(0, 200)}`
    );
  }
});
