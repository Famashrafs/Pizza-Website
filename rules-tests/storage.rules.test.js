// Firebase Storage security-rules tests.
//
// Run with:
//   npm run test:storage:emulator
//
// The suite verifies that public storefront reads remain available while every
// upload/delete is authenticated and scoped to the correct owner/restaurant.

'use strict';

const { readFileSync } = require('fs');
const { resolve } = require('path');
const test = require('node:test');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc } = require('firebase/firestore');

const PROJECT_ID = 'demo-rules-test';
const BUCKET_URL = `gs://${PROJECT_ID}.appspot.com`;

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8401,
      rules: readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: readFileSync(resolve(__dirname, '..', 'storage.rules'), 'utf8'),
    },
  });
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await seedUser('owner-1', 'restaurant_owner');
  await seedUser('owner-2', 'restaurant_admin');
  await seedUser('customer-1', 'customer');
});

test.after(async () => {
  if (testEnv) await testEnv.cleanup();
});

async function seedUser(uid, role) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), {
      uid,
      role,
      restaurantId: role === 'customer' ? null : 'restaurant-1',
    });
  });
}

function context(uid) {
  return uid
    ? testEnv.authenticatedContext(uid, {
        firebase: { sign_in_provider: 'password' },
      })
    : testEnv.unauthenticatedContext();
}

function imageBlob(type = 'image/png') {
  return new Blob(['image-bytes'], { type });
}

function storageFor(uid) {
  return context(uid).storage(BUCKET_URL);
}

// The rules-unit-testing context exposes the Firebase compat Storage service.
// These small adapters keep the test independent of the modular SDK's auth
// wiring while still exercising the real Storage emulator and rules.
function ref(storage, path) {
  return storage.ref(path);
}

function uploadBytes(objectRef, blob) {
  return objectRef.put(blob, { contentType: blob.type });
}

function deleteObject(objectRef) {
  return objectRef.delete();
}

async function getBytesFromURL(objectRef) {
  const url = await objectRef.getDownloadURL();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Storage read failed: HTTP ${response.status}`);
  return response.arrayBuffer();
}

test('an unauthenticated caller cannot upload a product image', async () => {
  const storage = storageFor(null);
  await assertFails(
    uploadBytes(
      ref(storage, 'products/restaurant-1/owner-1/public.png'),
      imageBlob()
    )
  );
});

test('a restaurant manager can upload their own product image', async () => {
  const storage = storageFor('owner-1');
  await assertSucceeds(
    uploadBytes(
      ref(storage, 'products/restaurant-1/owner-1/public.png'),
      imageBlob()
    )
  );
});

test('a customer cannot upload a product image', async () => {
  const storage = storageFor('customer-1');
  await assertFails(
    uploadBytes(
      ref(storage, 'products/restaurant-1/customer-1/public.png'),
      imageBlob()
    )
  );
});

test('a manager cannot upload into another manager uid segment', async () => {
  const storage = storageFor('owner-1');
  await assertFails(
    uploadBytes(
      ref(storage, 'products/restaurant-1/owner-2/forged.png'),
      imageBlob()
    )
  );
});

test('storage rejects non-image uploads and oversized images', async () => {
  const storage = storageFor('owner-1');
  await assertFails(
    uploadBytes(
      ref(storage, 'products/restaurant-1/owner-1/not-an-image.txt'),
      imageBlob('text/plain')
    )
  );

  const oversized = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], {
    type: 'image/png',
  });
  await assertFails(
    uploadBytes(
      ref(storage, 'products/restaurant-1/owner-1/too-large.png'),
      oversized
    )
  );
});

test('product images are publicly readable but not publicly writable', async () => {
  const ownerStorage = storageFor('owner-1');
  const objectRef = ref(
    ownerStorage,
    'products/restaurant-1/owner-1/public.png'
  );
  await assertSucceeds(uploadBytes(objectRef, imageBlob()));
  await assertSucceeds(getBytesFromURL(objectRef));

  const anonymousStorage = storageFor(null);
  await assertFails(
    uploadBytes(
      ref(
        anonymousStorage,
        'products/restaurant-1/owner-1/anonymous.png'
      ),
      imageBlob()
    )
  );
});

test('a restaurant manager can delete an old product image', async () => {
  const ownerStorage = storageFor('owner-2');
  const objectRef = ref(
    ownerStorage,
    'products/restaurant-1/owner-2/old.png'
  );
  await assertSucceeds(uploadBytes(objectRef, imageBlob()));

  const managerStorage = storageFor('owner-1');
  await assertSucceeds(deleteObject(ref(managerStorage, 'products/restaurant-1/owner-2/old.png')));
});

test('a customer can manage only their own profile photo', async () => {
  const customerStorage = storageFor('customer-1');
  const ownRef = ref(customerStorage, 'users/customer-1/profile/avatar.png');
  await assertSucceeds(uploadBytes(ownRef, imageBlob()));
  await assertSucceeds(getBytesFromURL(ownRef));

  const otherStorage = storageFor('owner-1');
  await assertFails(
    uploadBytes(
      ref(otherStorage, 'users/customer-1/profile/forged.png'),
      imageBlob()
    )
  );
  await assertFails(
    getBytesFromURL(ref(otherStorage, 'users/customer-1/profile/avatar.png'))
  );
});
