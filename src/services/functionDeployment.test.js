// Deployment wiring tests for the callable order endpoints.
//
// A missing deploy target surfaces at runtime as a browser CORS failure
// (a 404 from the callable endpoint ships no Access-Control-Allow-Origin),
// so these tests read the REAL artifacts — `firebase.json`, `.firebaserc`,
// `.env.example`/`.env.local`, `functions/index.js` and `orderGateway.js` —
// and assert the whole chain agrees: project id, function names, region and
// transport.

import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

describe('Cloud Functions deployment configuration', () => {
  it('declares the functions codebase in firebase.json', () => {
    const config = readJson('firebase.json');

    expect(config.functions).toBeDefined();
    expect(config.functions.source).toBe('functions');
    expect(fs.existsSync(path.join(repoRoot, 'functions', 'index.js'))).toBe(true);
  });

  it('keeps the existing Firestore configuration intact', () => {
    const config = readJson('firebase.json');

    expect(config.firestore).toEqual({
      rules: 'firestore.rules',
      indexes: 'firestore.indexes.json',
    });
    expect(fs.existsSync(path.join(repoRoot, 'firestore.rules'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'firestore.indexes.json'))).toBe(true);
  });

  it('points the Firebase CLI at the same project the frontend configures', () => {
    const rc = readJson('.firebaserc');
    expect(rc.projects.default).toBe('resturent-system');

    const example = read('.env.example');
    expect(example).toMatch(/REACT_APP_FIREBASE_PROJECT_ID/);

    // When a local env file exists it must target the deploy project —
    // otherwise the callable URL points at a project without the function.
    const localEnv = path.join(repoRoot, '.env.local');
    if (fs.existsSync(localEnv)) {
      const match = read('.env.local').match(/^REACT_APP_FIREBASE_PROJECT_ID=(.*)$/m);
      expect(match).not.toBeNull();
      expect(String(match[1]).trim()).toBe(rc.projects.default);
    }
  });

  it('exports createOrder and getGuestOrder as v2 callables', () => {
    const src = read('functions/index.js');

    expect(src).toMatch(/require\(['"]firebase-functions\/v2\/https['"]\)/);
    expect(src).toMatch(/exports\.createOrder\s*=\s*onCall\(/);
    expect(src).toMatch(/exports\.getGuestOrder\s*=\s*onCall\(/);
    expect(src).not.toMatch(/onRequest\s*\(/);
    expect(src).not.toMatch(/\.region\(/);
  });

  it('keeps the callable front door a thin wrapper over the shared order engine', () => {
    const src = read('functions/index.js');

    // The pricing/idempotency logic lives once, in the shared core, so the
    // callable and the demo HTTP API can never drift apart.
    expect(src).toMatch(/require\(['"]\.\/lib\/orderServiceCore['"]\)/);
    expect(src).toMatch(/createOrderService\s*\(/);
    expect(src).not.toMatch(/buildRequestSignature|generateGuestToken|checkoutReceipts/);
  });

  it('supports both the callable SDK and the free-tier HTTP API, behind config', () => {
    const src = read('src/services/orderGateway.js');

    // Callable fallback stays the production default (default region us-central1).
    expect(src).toMatch(/httpsCallable\(getFunctions\(app\),\s*['"]createOrder['"]\)/);
    expect(src).toMatch(/httpsCallable\(getFunctions\(app\),\s*['"]getGuestOrder['"]\)/);
    expect(src).not.toMatch(/getFunctions\(\s*app\s*,/);

    // The HTTP transport is opt-in via REACT_APP_API_BASE_URL and hits the demo API.
    expect(src).toMatch(/REACT_APP_API_BASE_URL/);
    expect(src).toMatch(/\/api\/orders\/create/);
    expect(src).toMatch(/\/api\/orders\/guest-lookup/);

    // No hardcoded deploy URL/project anywhere in the client bundle.
    expect(src).not.toMatch(/cloudfunctions\.net/);
    expect(src).not.toMatch(/resturent-system/);
  });

  it('documents the HTTP transport switch in .env.example', () => {
    expect(read('.env.example')).toMatch(/REACT_APP_API_BASE_URL/);
  });

  it('ships a self-contained Render web service for the demo API', () => {
    expect(fs.existsSync(path.join(repoRoot, 'server', 'app.js'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'server', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'server', 'firebaseAdmin.js'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'render.yaml'))).toBe(true);

    const pkg = JSON.parse(read('server/package.json'));
    expect(parseFloat(pkg.engines.node.replace(/[^\d.]/g, ''))).toBeGreaterThanOrEqual(20);
    expect(pkg.dependencies.express).toBeDefined();

    // The server must reuse the shared engine, not fork the pricing logic.
    expect(read('server/index.js')).toMatch(
      /require\(['"]\.\.\/functions\/lib\/orderServiceCore['"]\)/
    );

    // Render settings point at the server entry point and health check.
    const blueprint = read('render.yaml');
    expect(blueprint).toMatch(/node server\/index\.js/);
    expect(blueprint).toMatch(/healthCheckPath:\s*\/health/);
  });

  it('never commits the Firebase service-account secret', () => {
    // Only the placeholder example may mention the variable; a real key must
    // never appear in the repo.
    for (const rel of ['server/.env.example', 'render.yaml']) {
      const src = read(rel);
      expect(src).not.toMatch(/BEGIN PRIVATE KEY/);
      expect(src).not.toMatch(/"private_key"\s*:\s*"-----BEGIN/);
    }
  });

  it('matches the functions runtime declared for deployment', () => {
    const pkg = JSON.parse(read('functions/package.json'));

    expect(pkg.engines.node).toBe('20');
    expect(pkg.main).toBe('index.js');
    expect(pkg.dependencies['firebase-functions']).toBeDefined();
    expect(pkg.dependencies['firebase-admin']).toBeDefined();
  });
});
