#!/usr/bin/env node
// Validates the Firestore deployment config without requiring the Firebase CLI.
//
//   1. firestore.indexes.json MUST match the documented schema:
//      top-level keys are `indexes` and `fieldOverrides` only.
//   2. firestore.rules MUST be structurally sound (balanced braces outside
//      comments/strings) and contain the Phase-1 security invariants:
//      anonymous-identity detection, function-only order creation and the
//      default-deny catch-all.
//
// Exits non-zero on any violation so it can run in CI / as `npm run rules:check`.

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const errors = [];

function fail(file, message) {
  errors.push(`${file}: ${message}`);
}

// --- firestore.indexes.json -------------------------------------------------

function validateIndexes() {
  const file = 'firestore.indexes.json';
  const raw = fs.readFileSync(path.join(root, file), 'utf8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    fail(file, 'not valid JSON: ' + err.message);
    return;
  }

  const allowedTopLevel = ['indexes', 'fieldOverrides'];
  for (const key of Object.keys(json)) {
    if (!allowedTopLevel.includes(key)) {
      fail(file, `invalid top-level key "${key}" — only ${allowedTopLevel.join(', ')} are allowed`);
    }
  }

  const indexes = json.indexes || [];
  if (!Array.isArray(indexes)) {
    fail(file, '`indexes` must be an array');
  } else {
    indexes.forEach((index, i) => {
      if (!index || index.collectionGroup !== 'products') {
        fail(file, `indexes[${i}].collectionGroup must be "products"`);
      }
      if (index.queryScope !== 'COLLECTION' && index.queryScope !== 'COLLECTION_GROUP') {
        fail(file, `indexes[${i}].queryScope must be COLLECTION or COLLECTION_GROUP`);
      }
      if (!Array.isArray(index.fields) || index.fields.length === 0) {
        fail(file, `indexes[${i}].fields must be a non-empty array`);
      } else {
        for (const field of index.fields) {
          const ok =
            field && typeof field.fieldPath === 'string' &&
            ((field.order === 'ASCENDING' || field.order === 'DESCENDING') ||
              (field.arrayConfig === 'CONTAINS'));
          if (!ok) {
            fail(file, `indexes[${i}] has a malformed field entry: ${JSON.stringify(field)}`);
          }
        }
      }
    });
  }

  if (!Array.isArray(json.fieldOverrides)) {
    fail(file, '`fieldOverrides` must be an array');
  }
}

// --- firestore.rules --------------------------------------------------------

// Strips comments, string literals and line noise so brace counting only sees
// real rule blocks.
function stripIgnorable(content) {
  let cleaned = content
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  cleaned = cleaned.replace(/'([^'\\]|\\.)*'/g, "''");
  cleaned = cleaned.replace(/"([^"\\]|\\.)*"/g, '""');
  return cleaned;
}

function validateRules() {
  const file = 'firestore.rules';
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  const cleaned = stripIgnorable(content);

  let depth = 0;
  for (const char of cleaned) {
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    if (depth < 0) break;
  }
  if (depth !== 0) {
    fail(file, `unbalanced braces (depth ${depth})`);
  }

  const required = [
    {
      rx: /function isAnonymous\(\)/,
      message: 'missing isAnonymous() helper — anonymous sessions must be gated',
    },
    {
      rx: /sign_in_provider\s*==\s*'anonymous'/,
      message: 'missing sign_in_provider anonymous check',
    },
    {
      rx: /allow create:\s*if false;/,
      message: 'missing function-only order creation (allow create: if false)',
    },
    {
      rx: /match \/\{document=\*\*\}\s*\{\s*allow read,\s*write:\s*if false;/,
      message: 'missing default-deny catch-all at the end',
    },
    {
      rx: /canManageRestaurant\(restaurantId\)/,
      message: 'missing canManageRestaurant gating for restaurant resources',
    },
  ];

  // String-sensitive checks run against the RAW file; brace counting runs
  // against the cleaned (comment/string-stripped) copy.
  for (const { rx, message } of required) {
    if (!rx.test(content)) fail(file, message);
  }
}

validateIndexes();
validateRules();

if (errors.length) {
  console.error('Firestore config validation FAILED:');
  errors.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}

console.log('Firestore config validation passed:');
console.log('  firestore.indexes.json — schema OK');
console.log('  firestore.rules — braces balanced, security invariants present');