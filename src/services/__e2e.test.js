// TEMPORARY end-to-end diagnostic against the Firebase emulators - deleted after use.
// Runs the REAL db layer + REAL orderService (no db mock) so Firestore actually
// enforces the rules and actually validates field values.

process.env.REACT_APP_FIREBASE_API_KEY = 'fake-api-key';
process.env.REACT_APP_FIREBASE_AUTH_DOMAIN = 'demo-check.firebaseapp.com';
process.env.REACT_APP_FIREBASE_PROJECT_ID = 'demo-check';
process.env.REACT_APP_FIREBASE_STORAGE_BUCKET = 'demo-check.appspot.com';
process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID = '000000000000';
process.env.REACT_APP_FIREBASE_APP_ID = '1:000000000000:web:0000000000000000000000';

// The Firestore SDK's async queue uses setImmediate, which jsdom omits.
global.setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args);
global.clearImmediate = (id) => clearTimeout(id);

const app = require('../firebase').default;
const { getFirestore, connectFirestoreEmulator } = require('firebase/firestore');
const authMod = require('firebase/auth');

authMod.connectAuthEmulator(authMod.getAuth(app), 'http://127.0.0.1:9101', {
  disableWarnings: true,
});
connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8401, {
  disableWarnings: true,
});

const { createOrder } = require('./orderService');
const { RESTAURANT_ID } = require('../config/restaurant');
const db = require('./db').default;

jest.setTimeout(60000);

// This diagnostic only ever runs against live emulators (Firestore + the
// createOrder Callable Function), which cannot be assumed in a plain `npm test`
// run. It skips by default and activates with `REACT_APP_E2E=1`.
const describeE2E = process.env.REACT_APP_E2E ? describe : describe.skip;

describeE2E('real-emulator e2e order', () => {
  it('places a real order through the real Firestore emulator', async () => {
  const email = `e2e-${Date.now()}@example.com`;
  const cred = await authMod.createUserWithEmailAndPassword(
    authMod.getAuth(app),
    email,
    'Passw0rd!'
  );
  const uid = cred.user.uid;
  // eslint-disable-next-line no-console
  console.log('[e2e] signed in uid =', uid);

  let result;
  try {
    result = await createOrder({
      customerId: uid,
      items: [{ id: 'p1__line', productId: 'p1', name: 'Margherita', qty: 2 }],
      customer: {
        fullName: 'Ada Lovelace',
        email,
        phone: '+15551234567',
      },
      fulfillmentType: 'delivery',
      address: {
        street: '1 Analytical Ave',
        city: 'London',
        phone: '+15551234567',
      },
      paymentMethod: 'cash',
      restaurantId: RESTAURANT_ID,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log('[e2e] createOrder THREW:', {
      code: err && err.code,
      message: err && err.message,
    });
    throw err;
  }

  // eslint-disable-next-line no-console
  console.log('[e2e] success =', result.success);
  // eslint-disable-next-line no-console
  console.log('[e2e] errors  =', JSON.stringify(result.errors || {}));
  // eslint-disable-next-line no-console
  console.log(
    '[e2e] stored order =',
    JSON.stringify(
      {
        id: result.order && result.order.id,
        restaurantId: result.order && result.order.restaurantId,
        customerId: result.order && result.order.customerId,
        orderStatus: result.order && result.order.orderStatus,
        total: result.order && result.order.total,
        items: result.order && result.order.items && result.order.items.length,
        createdAt: result.order && result.order.createdAt,
      },
      null,
      2
    )
  );

  expect(result.success).toBe(true);
  });
});