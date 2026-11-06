#!/usr/bin/env node
// Validates the committed Firebase Storage configuration without changing any
// cloud resource. The bucket name is pinned to the existing Firebase project
// so a rules deployment cannot accidentally target another bucket.

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const errors = [];
const PROJECT_ID = 'resturent-system';
const EXPECTED_BUCKET = `${PROJECT_ID}.firebasestorage.app`;

function fail(message) {
  errors.push(message);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch (error) {
    fail(`${file}: not valid JSON (${error.message})`);
    return null;
  }
}

const firebaseJson = readJson('firebase.json');
if (firebaseJson) {
  const storage = firebaseJson.storage;
  if (!Array.isArray(storage) || storage.length !== 1) {
    fail('firebase.json: storage must be a one-entry array with an explicit bucket');
  } else {
    const entry = storage[0];
    if (entry.bucket !== EXPECTED_BUCKET) {
      fail(
        `firebase.json: storage bucket must be "${EXPECTED_BUCKET}" (found "${entry.bucket}")`
      );
    }
    if (entry.rules !== 'storage.rules') {
      fail('firebase.json: storage rules must be "storage.rules"');
    }
  }
}

const firebaseRc = readJson('.firebaserc');
if (firebaseRc && firebaseRc.projects?.default !== PROJECT_ID) {
  fail(
    `.firebaserc: default project must be "${PROJECT_ID}" (found "${firebaseRc.projects?.default}")`
  );
}

try {
  const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const project = env.match(/^REACT_APP_FIREBASE_PROJECT_ID=(.*)$/m)?.[1]?.trim();
  const bucket = env.match(/^REACT_APP_FIREBASE_STORAGE_BUCKET=(.*)$/m)?.[1]?.trim();
  if (project !== PROJECT_ID) {
    fail(`.env.example: Firebase project must be "${PROJECT_ID}"`);
  }
  if (bucket !== EXPECTED_BUCKET) {
    fail(`.env.example: Storage bucket must be "${EXPECTED_BUCKET}"`);
  }
} catch (error) {
  fail(`.env.example: ${error.message}`);
}

try {
  const rules = fs.readFileSync(path.join(root, 'storage.rules'), 'utf8');
  if (!rules.includes('service firebase.storage')) {
    fail('storage.rules: missing firebase.storage service declaration');
  }
  if (/allow\s+(read\s*,\s*)?write\s*:\s*if\s+true/.test(rules)) {
    fail('storage.rules: public write access must never be allowed');
  }
  if (!rules.includes('isRestaurantManager(restaurantId)')) {
    fail('storage.rules: restaurant manager boundary is missing');
  }
  if (!rules.includes('request.auth.uid == userId')) {
    fail('storage.rules: customer profile ownership boundary is missing');
  }
} catch (error) {
  fail(`storage.rules: ${error.message}`);
}

if (errors.length) {
  console.error('Storage config validation FAILED:');
  errors.forEach((message) => console.error(`  - ${message}`));
  process.exit(1);
}

console.log('Storage config validation passed:');
console.log(`  project: ${PROJECT_ID}`);
console.log(`  bucket: ${EXPECTED_BUCKET}`);
console.log('  storage.rules: authenticated writes only; no public write rule');
