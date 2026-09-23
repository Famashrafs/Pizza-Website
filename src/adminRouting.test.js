import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import App from './App';

// --- Firebase is fully mocked: these exercises exercise the real routing +
//     auth-context logic against the in-memory Firestore mock instead of a
//     live Firebase project. ------------------------------------------------

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
}));

jest.mock('./firebase', () => ({
  auth: { currentUser: null },
  default: {},
}));

// Profiles and restaurant records live in the mocked Firestore, exactly like a
// signed-up account would be found there in production.
function seedUser(uid, profile) {
  db.__setDocs({
    [`users/${uid}`]: {
      uid,
      name: profile.name || '',
      email: profile.email || '',
      phone: profile.phone || '',
      ...profile,
    },
  });
}

function seedRestaurant(restaurant) {
  db.__setDocs({ [`restaurants/${restaurant.id}`]: restaurant });
}

function goTo(path) {
  window.history.pushState({}, '', path);
}

// Resolves the auth state exactly once the AuthProvider has subscribed.
async function resolveAuth(user) {
  await waitFor(() => expect(authListener).toBeTruthy());
  await act(async () => {
    await authListener(user);
  });
}

beforeEach(() => {
  db.__reset();
  localStorage.clear();
  authListener = null;
  goTo('/');
});

test('a checking-authentication state is shown before the profile resolves', async () => {
  goTo('/admin');
  render(<App />);

  expect(screen.getByText(/Checking authentication/i)).toBeInTheDocument();

  await resolveAuth(null);
});

test('anonymous user visiting /admin is redirected to /login', async () => {
  goTo('/admin');
  render(<App />);
  await resolveAuth(null);

  await waitFor(() => expect(window.location.pathname).toBe('/login'));
});

test('owner sees a Dashboard entry in the account menu; customer does not', async () => {
  seedUser('owner-1', { role: 'restaurant_owner', email: 'owner@example.com' });
  const owner = render(<App />);
  await resolveAuth({ uid: 'owner-1', email: 'owner@example.com' });

  // The nav groups the account actions behind the avatar menu; opening it
  // reveals the owner-only Dashboard entry.
  const ownerMenuButton = await screen.findByRole('button', { name: /owner/i });
  fireEvent.click(ownerMenuButton);
  expect(
    await screen.findByRole('menuitem', { name: /Dashboard/i })
  ).toBeInTheDocument();
  owner.unmount();

  db.__reset();
  authListener = null;
  seedUser('cust-1', { role: 'customer', email: 'cust@example.com' });
  render(<App />);
  await resolveAuth({ uid: 'cust-1', email: 'cust@example.com' });
  const customerMenuButton = await screen.findByRole('button', { name: /cust/i });
  fireEvent.click(customerMenuButton);
  expect(
    screen.queryByRole('menuitem', { name: /Dashboard/i })
  ).not.toBeInTheDocument();
});

test('admin login and admin signup pages are reachable while signed out', async () => {
  goTo('/admin/login');
  const loginView = render(<App />);
  await resolveAuth(null);
  await waitFor(() =>
    expect(screen.getByText(/Restaurant Admin/i)).toBeInTheDocument()
  );
  loginView.unmount();

  authListener = null;
  goTo('/admin/register');
  render(<App />);
  await resolveAuth(null);
  await waitFor(() =>
    expect(screen.getByText(/Create your admin account/i)).toBeInTheDocument()
  );
});

test('logged-in customer visiting /admin is redirected to /account', async () => {
  seedUser('cust-1', { role: 'customer', email: 'cust@example.com' });
  goTo('/admin');
  render(<App />);
  await resolveAuth({ uid: 'cust-1', email: 'cust@example.com' });

  await waitFor(() => expect(window.location.pathname).toBe('/account'));
});

test('restaurant owner visiting /admin reaches the dashboard', async () => {
  seedUser('owner-1', {
    role: 'restaurant_owner',
    restaurantId: 'restaurant-pizza-demo',
    restaurantIds: { 'restaurant-pizza-demo': true },
    email: 'owner@example.com',
  });
  seedRestaurant({
    id: 'restaurant-pizza-demo',
    name: 'Demo Pizza',
    ownerId: 'owner-1',
  });
  goTo('/admin');
  render(<App />);
  await resolveAuth({ uid: 'owner-1', email: 'owner@example.com' });

  await waitFor(() => expect(window.location.pathname).toBe('/admin'));
  // The dashboard (not a blank screen / not the denial screen) rendered.
  await waitFor(() => expect(screen.getAllByText(/Dashboard/i).length).toBeGreaterThan(0));
  expect(screen.queryByText(/RESTRICTED AREA/i)).not.toBeInTheDocument();
});

test('owner refreshing /admin stays on the dashboard (profile rehydrated)', async () => {
  seedUser('owner-1', {
    role: 'restaurant_owner',
    restaurantId: 'restaurant-pizza-demo',
    restaurantIds: { 'restaurant-pizza-demo': true },
    email: 'owner@example.com',
  });
  seedRestaurant({
    id: 'restaurant-pizza-demo',
    name: 'Demo Pizza',
    ownerId: 'owner-1',
  });
  goTo('/admin');
  const first = render(<App />);
  await resolveAuth({ uid: 'owner-1', email: 'owner@example.com' });
  await waitFor(() => expect(window.location.pathname).toBe('/admin'));
  first.unmount();

  // Simulate a hard refresh: fresh mount, same URL + persisted profile.
  authListener = null;
  render(<App />);
  await resolveAuth({ uid: 'owner-1', email: 'owner@example.com' });
  await waitFor(() => expect(window.location.pathname).toBe('/admin'));
});