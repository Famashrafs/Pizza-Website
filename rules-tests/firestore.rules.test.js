// Firestore Security Rules tests for the `reviews` collection.
//
// Runs against the Firestore emulator via `@firebase/rules-unit-testing`:
//
//   npm run test:rules:emulator
//
// (which wraps this file in `firebase emulators:exec`). The critical
// regressions covered here are that an owner can DELETE their own review (the
// old combined `update, delete` rule read `request.resource`, which is null on
// delete, so every owner delete was denied) and that ownership can never move.

'use strict';

const { readFileSync } = require('fs');
const { resolve } = require('path');
const test = require('node:test');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-rules-test';

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
});

test.after(async () => {
  if (testEnv) await testEnv.cleanup();
});

async function seedReview(data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'reviews/rev-1'), data);
  });
}

const reviewer = (uid) =>
  testEnv.authenticatedContext(uid, {
    firebase: { sign_in_provider: 'password' },
  }).firestore();

const anon = () =>
  testEnv.authenticatedContext('anon-1', {
    firebase: { sign_in_provider: 'anonymous' },
  }).firestore();

test('the owner can delete their own review', async () => {
  await seedReview({ customerId: 'user-1', rating: 5 });
  await assertSucceeds(deleteDoc(doc(reviewer('user-1'), 'reviews/rev-1')));
});

test('another signed-in user cannot delete a review', async () => {
  await seedReview({ customerId: 'user-1', rating: 5 });
  await assertFails(deleteDoc(doc(reviewer('user-2'), 'reviews/rev-1')));
});

test('an unauthenticated caller cannot delete a review', async () => {
  await seedReview({ customerId: 'user-1', rating: 5 });
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(deleteDoc(doc(db, 'reviews/rev-1')));
});

test('an anonymous (guest) session cannot delete a review', async () => {
  await seedReview({ customerId: 'anon-1', rating: 5 });
  await assertFails(deleteDoc(doc(anon(), 'reviews/rev-1')));
});

test('the owner can update their review but cannot transfer ownership', async () => {
  await seedReview({ customerId: 'user-1', rating: 5 });
  const db = reviewer('user-1');
  await assertSucceeds(updateDoc(doc(db, 'reviews/rev-1'), { rating: 4 }));
  await assertFails(
    updateDoc(doc(db, 'reviews/rev-1'), { customerId: 'user-2' })
  );
});

test('another user cannot update a review', async () => {
  await seedReview({ customerId: 'user-1', rating: 5 });
  await assertFails(updateDoc(doc(reviewer('user-2'), 'reviews/rev-1'), { rating: 1 }));
});

test('create only succeeds when the caller owns the review document', async () => {
  const db = reviewer('user-1');
  await assertSucceeds(
    setDoc(doc(db, 'reviews/rev-new'), { customerId: 'user-1', rating: 5 })
  );
  await assertFails(
    setDoc(doc(db, 'reviews/rev-bad'), { customerId: 'user-2', rating: 5 })
  );
  await assertFails(
    setDoc(doc(db, 'reviews/rev-missing'), { rating: 5 })
  );
});

test('anonymous sessions and unauthenticated callers cannot create reviews', async () => {
  await assertFails(
    setDoc(doc(anon(), 'reviews/rev-anon'), { customerId: 'anon-1', rating: 5 })
  );
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(
    setDoc(doc(db, 'reviews/rev-unauth'), { customerId: 'user-1', rating: 5 })
  );
});

test('create rejects a review that violates the review schema', async () => {
  const db = reviewer('user-1');
  // Missing rating.
  await assertFails(setDoc(doc(db, 'reviews/rev-no-rating'), { customerId: 'user-1' }));
  // Rating out of range.
  await assertFails(
    setDoc(doc(db, 'reviews/rev-high'), { customerId: 'user-1', rating: 9 })
  );
  // Rating of the wrong type.
  await assertFails(
    setDoc(doc(db, 'reviews/rev-string'), { customerId: 'user-1', rating: 'five' })
  );
  // Comment too long for the allowed schema.
  await assertFails(
    setDoc(doc(db, 'reviews/rev-long'), {
      customerId: 'user-1',
      rating: 4,
      comment: 'x'.repeat(1001),
    })
  );
  // A valid document is accepted.
  await assertSucceeds(
    setDoc(doc(db, 'reviews/rev-ok'), {
      customerId: 'user-1',
      rating: 4,
      comment: 'Great pizza',
    })
  );
});

test('update rejects a document that violates the review schema', async () => {
  await seedReview({ customerId: 'user-1', rating: 5 });
  await assertFails(
    updateDoc(doc(reviewer('user-1'), 'reviews/rev-1'), { rating: 0 })
  );
});
