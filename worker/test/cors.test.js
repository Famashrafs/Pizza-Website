// CORS allowlist tests for the Worker transport (worker/src/cors.js).
// Kept in lockstep with server/test/app.test.js expectations.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAllowedOrigins,
  isOriginAllowed,
  normalizeOrigin,
  bearerToken,
  corsHeadersFor,
  DEFAULT_ALLOWED_ORIGINS,
} from '../src/cors.js';

test('parseAllowedOrigins falls back to local dev origins and normalizes', () => {
  assert.deepEqual(parseAllowedOrigins(''), ['http://localhost:3000', 'http://127.0.0.1:3000']);
  assert.deepEqual(parseAllowedOrigins(' https://a.example/ , http://b.example '), [
    'https://a.example',
    'http://b.example',
  ]);
  assert.deepEqual(parseAllowedOrigins(['https://c.example']), ['https://c.example']);
  assert.deepEqual(DEFAULT_ALLOWED_ORIGINS, ['http://localhost:3000', 'http://127.0.0.1:3000']);
});

test('isOriginAllowed matches exactly (no wildcard)', () => {
  const allowed = parseAllowedOrigins('https://app.example,http://localhost:3000');
  assert.equal(isOriginAllowed('https://app.example', allowed), true);
  assert.equal(isOriginAllowed('https://app.example.evil.com', allowed), false);
  assert.equal(isOriginAllowed('https://evil.example', allowed), false);
  assert.equal(isOriginAllowed(null, allowed), false);
  assert.equal(isOriginAllowed('https://anything.example', ['*']), true);
});

test('normalizeOrigin strips trailing slashes and whitespace', () => {
  assert.equal(normalizeOrigin(' https://a.example// '), 'https://a.example');
});

test('bearerToken parses only the Bearer scheme', () => {
  assert.equal(bearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(bearerToken('bearer   spaced '), 'spaced');
  assert.equal(bearerToken('Basic dXNlcjpwdw=='), null);
  assert.equal(bearerToken(''), null);
  assert.equal(bearerToken(null), null);
});

test('corsHeadersFor echoes the request origin, never a wildcard', () => {
  const headers = corsHeadersFor('https://app.example');
  assert.equal(headers['Access-Control-Allow-Origin'], 'https://app.example');
  assert.equal(headers.Vary, 'Origin');
  assert.match(headers['Access-Control-Allow-Headers'], /Authorization/);
  assert.notEqual(headers['Access-Control-Allow-Origin'], '*');
});
