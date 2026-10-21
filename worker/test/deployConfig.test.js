// Deployment-configuration guard.
//
// The Worker hosts the BACKEND ONLY — the React storefront stays on Vercel.
// This test fails if anything ever re-introduces a static-assets binding (or
// any other way of uploading the React `build/` output to Cloudflare).
//
// Why this exists: running `wrangler deploy` from the repository ROOT makes
// wrangler v4 "autoconfig" detect the CRA app and generate a config with
// `assets.directory = "build"`. The deploy then uploads the whole React build
// and fails with `Asset too large: build/images/Untitled-1.png (31.1 MiB;
// maximum 25 MiB)`. The API itself never needed those assets.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(workerDir, '..');
const read = (rel) => fs.readFileSync(path.join(workerDir, rel), 'utf8');
const readRepo = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

test('the Worker config declares only the backend script (no static assets)', () => {
  const toml = read('wrangler.toml');

  // The Worker entry point is the API server, not the React app.
  assert.match(toml, /^main\s*=\s*"src\/index\.js"$/m);
  assert.match(toml, /^name\s*=\s*"pizza-demo-api"$/m);

  // No assets/site binding of any kind: the frontend is served by Vercel.
  assert.doesNotMatch(toml, /^\s*\[assets\]/m);
  assert.doesNotMatch(toml, /^\s*assets\s*=/m);
  assert.doesNotMatch(toml, /^\s*site\s*=/m);
  assert.doesNotMatch(toml, /^\s*bucket\s*=/m);
  assert.doesNotMatch(toml, /^\s*\[site\]/m);
  assert.doesNotMatch(toml, /^\s*\[kv_namespaces\]/m);
  assert.doesNotMatch(toml, /^\s*\[durable_objects\]/m);

  // Nothing may point at the React build output or the frontend public dir.
  assert.doesNotMatch(toml, /"build"/);
  assert.doesNotMatch(toml, /"public"/);
  assert.doesNotMatch(toml, /"dist"/);
});

test('the deploy script pins the config file and disables wrangler autoconfig', () => {
  const pkg = JSON.parse(read('package.json'));

  // Without --no-autoconfig, `wrangler deploy` run from the repo root detects
  // the CRA app and uploads build/ as Workers static assets.
  assert.match(pkg.scripts.deploy, /--config\s+wrangler\.toml/);
  assert.match(pkg.scripts.deploy, /--no-autoconfig/);
  assert.match(pkg.scripts.deploy, /wrangler deploy/);

  // The dry-run variant is the safe pre-flight check (no upload, no auth).
  assert.match(pkg.scripts['deploy:dry-run'], /--dry-run/);
  assert.match(pkg.scripts['deploy:dry-run'], /--no-autoconfig/);
});

test('the repository root exposes one canonical backend-only deploy command', () => {
  const pkg = JSON.parse(readRepo('package.json'));

  assert.match(pkg.scripts['deploy:worker'], /worker run deploy/);
  assert.match(pkg.scripts['deploy:worker:dry-run'], /worker run deploy:dry-run/);

  // The root build script stays a pure Vercel/frontend concern.
  assert.match(pkg.scripts.build, /react-scripts build/);
});

test('the Worker package never depends on the React toolchain', () => {
  const pkg = JSON.parse(read('package.json'));

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const forbidden of ['react', 'react-dom', 'react-scripts', 'typescript']) {
    assert.equal(deps[forbidden], undefined, `${forbidden} must not be a Worker dependency`);
  }
});

// Regression guard for the production "Error 1101" incident.
//
// The shared order engine is CommonJS and is bundled by esbuild when wrangler
// builds the Worker. A BARE builtin specifier (`require('crypto')`) is bundled
// as `import libDefault from "crypto"`, and the Workers module loader only
// exposes Node builtins under the `node:` namespace — the bare import cannot
// be resolved, the Worker fails to load and Cloudflare answers every request
// (including /health) with the generic 1101 page and no CORS headers.
//
// The `node:` prefixed form is bundled correctly AND still works on the Node
// hosts (Firebase callables, Express/Render, Jest), so it is the only
// acceptable spelling in the shared engine.
test('the shared engine only requires node: prefixed builtins', () => {
  const shared = [
    'functions/lib/orderCore.js',
    'functions/lib/orderServiceCore.js',
  ];

  // Comments are stripped first: the sources DOCUMENT the bare-specifier pitfall
  // in prose, and only real require() calls matter.
  const stripComments = (src) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  for (const rel of shared) {
    const source = stripComments(readRepo(rel));
    const bare = [...source.matchAll(/require\((['"])(?!node:)([a-z_]+)\1\)/g)];
    for (const [, , specifier] of bare) {
      assert.fail(
        `${rel} requires the bare builtin "${specifier}" — use require('node:${specifier}') ` +
          'or the Worker bundle fails to load (Cloudflare Error 1101).'
      );
    }
  }
});

test('the Worker entry point never lets an exception escape fetch', () => {
  const source = read('src/index.js');

  // The request handler must be wrapped: an uncaught exception becomes a
  // Cloudflare 1101 page without CORS headers.
  assert.match(source, /catch\s*\(/);
  assert.match(source, /corsHeadersForRequest\(/);
});
