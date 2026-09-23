// Smoke tests for the platform foundation that don't require a live Firebase
// project (the previous template test rendered the whole App, which needs
// Firebase env config that CI does not have). Data layer tests run against the
// in-memory Firestore mock in `src/services/__mocks__/db.js`.

jest.mock('./services/db');
const db = require('./services/db');

import { normalizeRole, roleHasAdminAccess, ROLES } from './config/roles';
import { onboardOwnerRestaurant, getOwnerRestaurant } from './services/restaurantService';

beforeEach(() => {
  db.__reset();
});

test('roles default unknown/legacy profiles to customer', () => {
  expect(normalizeRole(undefined)).toBe(ROLES.CUSTOMER);
  expect(normalizeRole('anything')).toBe(ROLES.CUSTOMER);
  expect(normalizeRole(ROLES.RESTAURANT_OWNER)).toBe(ROLES.RESTAURANT_OWNER);
});

test('only admin-level roles may access /admin', () => {
  expect(roleHasAdminAccess(ROLES.RESTAURANT_OWNER)).toBe(true);
  expect(roleHasAdminAccess(ROLES.RESTAURANT_ADMIN)).toBe(true);
  expect(roleHasAdminAccess(ROLES.STAFF)).toBe(true);
  expect(roleHasAdminAccess(ROLES.PLATFORM_ADMIN)).toBe(true);
  expect(roleHasAdminAccess(ROLES.CUSTOMER)).toBe(false);
  expect(roleHasAdminAccess(null)).toBe(false);
});

describe('owner -> restaurant relationship', () => {
  test('onboarding claims the deployment restaurant for a first owner', async () => {
    const restaurant = await onboardOwnerRestaurant({ ownerId: 'owner-1', name: 'Slice House' });
    expect(restaurant.ownerId).toBe('owner-1');
    expect((await getOwnerRestaurant('owner-1'))?.id).toBe(restaurant.id);
  });

  test('a second owner cannot take over a claimed restaurant', async () => {
    await onboardOwnerRestaurant({ ownerId: 'owner-1', name: 'Slice House' });
    const second = await onboardOwnerRestaurant({ ownerId: 'owner-2', name: 'Slice House' });

    // owner-1 keeps the deployment restaurant; owner-2 gets a new one.
    expect((await getOwnerRestaurant('owner-1'))?.ownerId).toBe('owner-1');
    expect(second.ownerId).toBe('owner-2');
    expect(second.id).not.toBe((await getOwnerRestaurant('owner-1'))?.id);
  });
});