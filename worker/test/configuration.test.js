// Deployment-configuration guard for required bindings and production CORS.
//
// These tests intentionally read the deploy artifacts rather than importing
// the runtime defaults: the production allowlist and the documented secret
// names must agree with worker/deployment.config.json, wrangler.toml, and
// worker/.dev.vars.example. Removing a required binding or replacing the
// stable production Vercel alias with an old/deployment-specific hostname
// makes this suite fail.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { API_VERSION } from '../src/app.js';
import { parseAllowedOrigins } from '../src/cors.js';

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(workerDir, '..');
const read = (rel) => fs.readFileSync(path.join(workerDir, rel), 'utf8');
const readRepo = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

const deployment = readJson('deployment.config.json');
const toml = read('wrangler.toml');
const devVarsExample = read('.dev.vars.example');
const workerReadme = read('README.md');
const rootReadme = readRepo('README.md');

const EXPECTED_REQUIRED = {
  plain: [
    'CORS_ALLOWED_ORIGINS',
    'DEMO_MODE',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_WEB_API_KEY',
  ],
  external: ['SUPABASE_URL'],
  secret: [
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'SUPABASE_SERVICE_ROLE_KEY',
  ],
};

const EXPECTED_OPTIONAL_LOCAL = ['FIRESTORE_EMULATOR_HOST'];

function readTomlVars(source) {
  const vars = {};
  let inVars = false;
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
      inVars = /^\s*\[vars\]\s*$/.test(line);
      continue;
    }
    if (!inVars) continue;
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*"([^"]*)"\s*$/);
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

function exampleBindingNames(source) {
  return new Set(
    [...source.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((match) => match[1])
  );
}

function requiredNames() {
  return Object.values(deployment.requiredProductionVariables).flat();
}

test('the required production-variable manifest cannot silently lose a binding', () => {
  assert.deepEqual(deployment.requiredProductionVariables, EXPECTED_REQUIRED);
  assert.deepEqual(deployment.optionalLocalVariables, EXPECTED_OPTIONAL_LOCAL);
});

test('wrangler.toml contains every non-secret production binding', () => {
  const vars = readTomlVars(toml);
  for (const name of deployment.requiredProductionVariables.plain) {
    assert.ok(name in vars, `${name} is missing from worker/wrangler.toml [vars]`);
    assert.ok(vars[name].trim(), `${name} must not be empty in worker/wrangler.toml`);
  }
});

test('the local example documents every required and optional Worker binding', () => {
  const names = exampleBindingNames(devVarsExample);
  for (const name of requiredNames()) {
    assert.ok(names.has(name), `${name} is missing from worker/.dev.vars.example`);
  }
  for (const name of deployment.optionalLocalVariables) {
    assert.ok(
      devVarsExample.includes(`${name}=`),
      `${name} is missing from worker/.dev.vars.example`
    );
  }
});

test('every Worker environment binding is declared in the configuration manifest', () => {
  const sourceFiles = fs
    .readdirSync(path.join(workerDir, 'src'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(workerDir, 'src', name), 'utf8'))
    .join('\n');
  const runtimeNames = new Set(
    [...sourceFiles.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1])
  );
  const documentedNames = new Set([
    ...requiredNames(),
    ...deployment.optionalLocalVariables,
  ]);

  assert.deepEqual([...runtimeNames].sort(), [...documentedNames].sort());
});

test('secret examples contain placeholders only and never credential values', () => {
  const lines = new Map(
    devVarsExample
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]])
  );

  for (const name of deployment.requiredProductionVariables.secret) {
    const value = lines.get(name) || '';
    assert.match(value, /replace-with/i, `${name} must use a placeholder value`);
  }

  assert.doesNotMatch(devVarsExample, /BEGIN PRIVATE KEY/);
  assert.doesNotMatch(devVarsExample, /AIza[0-9A-Za-z_-]{20,}/);
});

test('the CORS allowlist contains the exact approved production and local origins', () => {
  const vars = readTomlVars(toml);
  assert.ok(vars.CORS_ALLOWED_ORIGINS);

  const expected = [
    ...deployment.localDevelopmentOrigins,
    ...deployment.productionOrigins,
    ...deployment.supportedPreviewOrigins,
  ];
  assert.deepEqual(parseAllowedOrigins(vars.CORS_ALLOWED_ORIGINS), expected);

  assert.deepEqual(deployment.productionOrigins, [
    'https://pizza-website-sv2j.vercel.app',
  ]);
  assert.deepEqual(deployment.localDevelopmentOrigins, [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);
  assert.deepEqual(deployment.supportedPreviewOrigins, []);

  const exampleCors = devVarsExample.match(/^CORS_ALLOWED_ORIGINS=(.*)$/m)?.[1];
  assert.ok(exampleCors, 'worker/.dev.vars.example is missing CORS_ALLOWED_ORIGINS');
  assert.deepEqual(parseAllowedOrigins(exampleCors), expected);
});

test('the CORS allowlist has no wildcard, stale alias, or deployment-specific host', () => {
  const vars = readTomlVars(toml);
  const origins = parseAllowedOrigins(vars.CORS_ALLOWED_ORIGINS);

  assert.ok(!origins.includes('*'));
  assert.ok(!origins.includes('https://pizza-website-famashrafs-projects.vercel.app'));
  assert.ok(!origins.includes('https://pizza-website-taupe.vercel.app'));
  assert.ok(!origins.some((origin) => /restro-[a-z0-9]+-famashrafs-projects/i.test(origin)));
});

test('deployment documentation lists every required binding and approved origin', () => {
  for (const name of requiredNames()) {
    assert.ok(workerReadme.includes(name), `worker/README.md does not document ${name}`);
    assert.ok(rootReadme.includes(name), `README.md does not document ${name}`);
  }
  for (const origin of [
    ...deployment.productionOrigins,
    ...deployment.localDevelopmentOrigins,
  ]) {
    assert.ok(workerReadme.includes(origin), `worker/README.md does not document ${origin}`);
    assert.ok(rootReadme.includes(origin), `README.md does not document ${origin}`);
  }
});

test('the repository, diagnostics, and deployment manifest report one API version', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, deployment.apiVersion);
  assert.equal(API_VERSION, deployment.apiVersion);
});
