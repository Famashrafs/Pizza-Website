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

test('legacy owner with no Firestore profile is recovered via the restaurant ownerId', async () => {
  // Account predates the migration: Firebase Auth exists, no `users/{uid}` doc.
  // The restaurant document is the only authority.
  seedRestaurant({
    id: 'restaurant-pizza-demo',
    name: 'Demo Pizza',
    ownerId: 'owner-legacy-1',
  });
  goTo('/admin');
  render(<App />);
  await resolveAuth({ uid: 'owner-legacy-1', email: 'old.owner@example.com' });

  await waitFor(() => expect(window.location.pathname).toBe('/admin'));
  const profile = db.__getDocs()['users/owner-legacy-1'];
  expect(profile).toBeTruthy();
  expect(profile.role).toBe('restaurant_owner');
  expect(profile.restaurantId).toBe('restaurant-pizza-demo');
  expect(profile.restaurantIds['restaurant-pizza-demo']).toBe(true);
});

test('signed-in user with no owned restaurant is NOT granted admin access', async () => {
  // No profile doc, no restaurant with ownerId == uid → stays a customer.
  goTo('/admin');
  render(<App />);
  await resolveAuth({ uid: 'plain-1', email: 'plain@example.com' });

  await waitFor(() => expect(window.location.pathname).toBe('/account'));
});

test('ownership is never granted from a restaurant owned by someone else', async () => {
  // The restaurant exists but belongs to another uid — permission is denied
  // regardless of what any legacy client data might claim.
  seedRestaurant({
    id: 'restaurant-pizza-demo',
    name: 'Demo Pizza',
    ownerId: 'other-owner',
  });
  goTo('/admin');
  render(<App />);
  await resolveAuth({ uid: 'impostor-1', email: 'impostor@example.com' });

  await waitFor(() => expect(window.location.pathname).toBe('/account'));
  expect(db.__getDocs()['users/impostor-1']).toBeUndefined();
});

test('existing owner profile missing restaurant identity is repaired', async () => {
  // Post-migration profile exists with the owner role but the restaurant
  // identity was never written — the owned restaurant restores it.
  seedUser('owner-partial-1', {
    role: 'restaurant_owner',
    email: 'owner.partial@example.com',
  });
  seedRestaurant({
    id: 'restaurant-pizza-demo',
    name: 'Demo Pizza',
    ownerId: 'owner-partial-1',
  });
  goTo('/admin');
  render(<App />);
  await resolveAuth({ uid: 'owner-partial-1', email: 'owner.partial@example.com' });

  await waitFor(() => expect(window.location.pathname).toBe('/admin'));
  const profile = db.__getDocs()['users/owner-partial-1'];
  expect(profile.role).toBe('restaurant_owner');
  expect(profile.restaurantId).toBe('restaurant-pizza-demo');
  expect(profile.restaurantIds['restaurant-pizza-demo']).toBe(true);
});

test('a customer role is never silently promoted by recovery', async () => {
  // Inconsistent data: restaurants/<id>.ownerId == uid but users/<uid>.role is
  // customer. The profile must NOT be overwritten (rules forbid client role
  // changes too) — the conflict is logged for manual review.
  seedUser('cust-but-owned-1', {
    role: 'customer',
    email: 'odd@example.com',
  });
  seedRestaurant({
    id: 'restaurant-pizza-demo',
    name: 'Demo Pizza',
    ownerId: 'cust-but-owned-1',
  });
  goTo('/admin');
  render(<App />);
  await resolveAuth({ uid: 'cust-but-owned-1', email: 'odd@example.com' });

  await waitFor(() => expect(window.location.pathname).toBe('/account'));
  const profile = db.__getDocs()['users/cust-but-owned-1'];
  expect(profile.role).toBe('customer');
  expect(profile.restaurantId).toBeUndefined();
});

test('ambiguous ownership resolves deterministically to the deployment restaurant', async () => {
  // No profile doc, but the uid owns two restaurants — recovery must prefer
  // the active deployment restaurant instead of picking arbitrarily.
  seedRestaurant({
    id: 'restaurant-pizza-demo',
    name: 'Demo Pizza',
    ownerId: 'owner-multi-1',
  });
  seedRestaurant({
    id: 'rest-other-1',
    name: 'Other Branch',
    ownerId: 'owner-multi-1',
  });
  goTo('/admin');
  render(<App />);
  await resolveAuth({ uid: 'owner-multi-1', email: 'multi@example.com' });

  await waitFor(() => expect(window.location.pathname).toBe('/admin'));
  expect(db.__getDocs()['users/owner-multi-1'].restaurantId).toBe(
    'restaurant-pizza-demo'
  );
});