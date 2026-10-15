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

  it('calls both functions through the callable SDK in the shared default region', () => {
    const src = read('src/services/orderGateway.js');

    expect(src).toMatch(/httpsCallable\(getFunctions\(app\),\s*['"]createOrder['"]\)/);
    expect(src).toMatch(/httpsCallable\(getFunctions\(app\),\s*['"]getGuestOrder['"]\)/);
    // One-argument getFunctions(app) => default region us-central1, which
    // matches the backend default. An explicit region must not drift.
    expect(src).not.toMatch(/getFunctions\(\s*app\s*,/);
    // No raw fetch fallback: the callable protocol must stay intact.
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/cloudfunctions\.net/);
  });

  it('matches the functions runtime declared for deployment', () => {
    const pkg = JSON.parse(read('functions/package.json'));

    expect(pkg.engines.node).toBe('20');
    expect(pkg.main).toBe('index.js');
    expect(pkg.dependencies['firebase-functions']).toBeDefined();
    expect(pkg.dependencies['firebase-admin']).toBeDefined();
  });
});
