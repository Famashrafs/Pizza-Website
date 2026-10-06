// TEMPORARY emulator seed helper - deleted after debugging.
const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
} = require('firebase/firestore');

const app = initializeApp({ projectId: 'demo-check', apiKey: 'fake' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8401);

const RID = 'restaurant-pizza-demo';

(async () => {
  await setDoc(doc(db, 'restaurants', RID), {
    name: 'Pizza',
    ownerId: 'owner-bootstrap',
  });
  await setDoc(doc(db, 'products', 'p1'), {
    name: 'Margherita',
    restaurantId: RID,
    category: 'Pizza',
    categoryId: 'cat-pizza',
    description: 'Tomato, mozzarella, basil',
    basePrice: 10,
    available: true,
    archived: false,
    sortOrder: 0,
  });
  console.log('seeded restaurant + product');
  process.exit(0);
})().catch((e) => {
  console.error('seed failed', e && e.message);
  process.exit(1);
});