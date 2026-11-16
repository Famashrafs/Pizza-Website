// Cross-repository security guards for the Supabase Storage migration.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { safeErrorMessage } from '../src/errors.js';
import { createWorkerEntrypoint } from '../src/index.js';

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(workerDir, '..');

function filesUnder(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

test('the service-role credential has no frontend or browser-variable footprint', () => {
  const frontendFiles = filesUnder(path.join(repoRoot, 'src')).filter((file) =>
    /\.(js|jsx|ts|tsx|json|css)$/.test(file)
  );
  const configFiles = [
    path.join(repoRoot, '.env.example'),
    path.join(repoRoot, 'package.json'),
    path.join(workerDir, 'wrangler.toml'),
  ].filter((file) => fs.existsSync(file));

  for (const file of frontendFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(repoRoot, file);
    assert.ok(
      !source.includes('SUPABASE_SERVICE_ROLE_KEY'),
      `${relative} must not contain the Supabase service-role credential`
    );
    assert.ok(
      !source.includes('REACT_APP_SUPABASE'),
      `${relative} must not expose a Supabase browser credential`
    );
  }

  // Server-side deployment artifacts may name the binding, but must never
  // assign a credential value to it.
  for (const file of configFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(repoRoot, file);
    assert.doesNotMatch(
      source,
      /^\s*SUPABASE_SERVICE_ROLE_KEY\s*=/m,
      `${relative} must not assign a Supabase service-role credential`
    );
    assert.ok(
      !source.includes('REACT_APP_SUPABASE'),
      `${relative} must not expose a Supabase browser credential`
    );
  }
});

test('the server-only dev template names the service-role binding without a value', () => {
  const source = fs.readFileSync(path.join(workerDir, '.dev.vars.example'), 'utf8');
  assert.match(
    source,
    /^SUPABASE_SERVICE_ROLE_KEY=replace-with-supabase-service-role-key$/m
  );
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?!replace-with)\S+/);
});

test('the Worker reads the service-role credential only from its server environment', () => {
  const source = fs.readFileSync(path.join(workerDir, 'src', 'index.js'), 'utf8');
  assert.match(source, /env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /safeErrorMessage\(err,\s*secrets\)/);
});

test('log-safe messages redact the configured service-role secret', () => {
  const secret = 'service-role-secret-value-123456';
  const message = safeErrorMessage(
    new Error(`request failed with Bearer ${secret}`),
    [secret]
  );
  assert.ok(!message.includes(secret));
  assert.match(message, /\[REDACTED\]/);
});

test('diagnostics never expose the Supabase URL, service-role key, or private key', async () => {
  const handler = createWorkerEntrypoint();
  const secret = 'service-role-secret-value-123456';
  const res = await handler.fetch(
    new Request('https://api.test/api/diagnostics'),
    {
      FIREBASE_PROJECT_ID: 'demo-worker-test',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: 'demo-worker-test',
        client_email: 'service@example.com',
        private_key: 'private-test-key',
      }),
      SUPABASE_URL: 'https://private-project.supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: secret,
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    }
  );

  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!text.includes(secret));
  assert.ok(!text.includes('private-project.supabase.test'));
  assert.ok(!text.includes('private-test-key'));
  const body = JSON.parse(text);
  assert.equal(body.dependencies.supabase.state, 'configured');
  assert.ok(!('supabase' in body.features));
});
