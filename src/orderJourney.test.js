import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import App from './App';

// App-level ordering journey: refresh-safe confirmation recovery for guests and
// registered customers, and the guest access boundary. Firebase is mocked the
// same way as `adminRouting.test.js` so the real routing + auth context run
// against the in-memory Firestore mock.

jest.mock('./services/db');
const db = require('./services/db');

let authListener = null;

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: (_auth, cb) => {
    authListener = cb;
    return () => {
      authListener = null;
    };
  },
  updateProfile: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendEmailVerification: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  reauthenticateWithPopup: jest.fn(),
  updateEmail: jest.fn(),
  updatePassword: jest.fn(),
  deleteUser: jest.fn(),
  EmailAuthProvider: { credential: jest.fn() },
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
  setPersistence: jest.fn(),
  browserLocalPersistence: {},
  browserSessionPersistence: {},
  signInAnonymously: jest.fn(async () => ({
    user: { uid: 'anon-guest-1', isAnonymous: true },
  })),
  getRedirectResult: jest.fn(),
}));

jest.mock('./firebase', () => ({
  auth: { currentUser: null },
  default: {},
}));

// The confirmation page resolves guest orders through the orderGateway, whose
// Jest mock runs the REAL server-side order core. No extra mock is needed: the
// automatic manual mock under `__mocks__` is used.
jest.mock('./services/orderGateway');

const sha256 = (value) =>
  require('crypto').createHash('sha256').update(value).digest('hex');

function goTo(path) {
  window.history.pushState({}, '', path);
}

async function resolveAuth(user) {
  await waitFor(() => expect(authListener).toBeTruthy());
  await act(async () => {
    await authListener(user);
  });
}

const ORDER_ID = 'ORD-ABC123';

function seedOrder(overrides = {}) {
  db.__setDocs({
    [`orders/${ORDER_ID}`]: {
      id: ORDER_ID,
      restaurantId: 'restaurant-pizza-demo',
      customerId: 'anon-guest-1',
      customerType: 'guest',
      orderStatus: 'preparing',
      fulfillmentType: 'delivery',
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      subtotal: 20,
      deliveryFee: 3.99,
      tax: 1.6,
      total: 25.59,
      customer: { fullName: 'Ada Lovelace', phone: '+15551234567' },
      items: [
        { id: 'p1__line', productId: 'p1', name: 'Margherita', qty: 2, unitPrice: 10, lineTotal: 20 },
      ],
      statusHistory: [
        { status: 'placed', at: '2025-01-01T00:00:00.000Z', changedBy: 'customer' },
        { status: 'preparing', at: '2025-01-01T00:05:00.000Z', changedBy: 'restaurant' },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:05:00.000Z',
      ...overrides,
    },
  });
}

beforeEach(() => {
  db.__reset();
  localStorage.clear();
  authListener = null;
  goTo('/order-confirmation');
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('a guest confirmation survives a refresh via the token-verified lookup', async () => {
  const token = 'guest-token-abcdefghijklmnopqrstuvwxyz012345';
  seedOrder({ guestTokenHash: sha256(token) });
  localStorage.setItem(
    'last-order',
    JSON.stringify({ orderId: ORDER_ID, token, placedAt: '2025-01-01T00:00:00.000Z' })
  );

  render(<App />);
  await resolveAuth({ uid: 'anon-guest-1', isAnonymous: true });

  expect(await screen.findByText(/Order confirmed/i)).toBeInTheDocument();
  expect(screen.getByText(ORDER_ID)).toBeInTheDocument();
  // Cash is pending: the honest "due on delivery" note replaces any fake
  // "confirmation email sent" copy.
  expect(screen.getByText(/Payment due on delivery/i)).toBeInTheDocument();
  expect(screen.queryByText(/No order found/i)).not.toBeInTheDocument();
});

test('a wrong/absent guest token never exposes the order', async () => {
  seedOrder({ guestTokenHash: sha256('the-real-token-abcdefghijklmnopqrstuvwxyz') });
  // No token stored → the lookup cannot authorize.
  localStorage.setItem(
    'last-order',
    JSON.stringify({ orderId: ORDER_ID, placedAt: '2025-01-01T00:00:00.000Z' })
  );

  render(<App />);
  await resolveAuth({ uid: 'anon-guest-1', isAnonymous: true });

  expect(await screen.findByText(/No order found/i)).toBeInTheDocument();
  expect(screen.queryByText(/Order confirmed/i)).not.toBeInTheDocument();
});

test('a registered customer recovers their order on refresh via ownership', async () => {
  seedOrder({
    customerId: 'cust-1',
    customerType: 'customer',
  });
  localStorage.setItem(
    'last-order',
    JSON.stringify({ orderId: ORDER_ID, uid: 'cust-1', placedAt: '2025-01-01T00:00:00.000Z' })
  );

  render(<App />);
  await resolveAuth({ uid: 'cust-1', email: 'cust@example.com' });

  expect(await screen.findByText(/Order confirmed/i)).toBeInTheDocument();
  expect(screen.getByText(ORDER_ID)).toBeInTheDocument();
});

test('an unrecoverable confirmation shows an honest "no order" state', async () => {
  render(<App />);
  await resolveAuth(null);

  expect(await screen.findByText(/No order found/i)).toBeInTheDocument();
});

test('a guest is blocked from the registered order history', async () => {
  goTo('/orders');
  render(<App />);
  await resolveAuth({ uid: 'anon-guest-1', isAnonymous: true });

  expect(await screen.findByText(/Login to view your orders/i)).toBeInTheDocument();
});
