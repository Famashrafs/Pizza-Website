// Smoke tests for the platform foundation that don't require a live Firebase
// project (the previous template test rendered the whole App, which needs
// Firebase env config that CI does not have). Data layer tests run against the
// in-memory Firestore mock in `src/services/__mocks__/db.js`.

jest.mock('./services/db');
const db = require('./services/db');

import { normalizeRole, roleHasAdminAccess, ROLES } from './config/roles';
import { getRestaurantById } from './services/restaurantService';

beforeEach(() => {
  db.__reset();
});

test('roles default unknown/legacy profiles to customer', () => {
  expect(normalizeRole(undefined)).toBe(ROLES.CUSTOMER);
  expect(normalizeRole('anything')).toBe(ROLES.CUSTOMER);
  expect(normalizeRole(ROLES.RESTAURANT_OWNER)).toBe(ROLES.RESTAURANT_OWNER);
});

test('only restaurant owner/admin roles may access /admin', () => {
  expect(roleHasAdminAccess(ROLES.RESTAURANT_OWNER)).toBe(true);
  expect(roleHasAdminAccess(ROLES.RESTAURANT_ADMIN)).toBe(true);
  expect(roleHasAdminAccess(ROLES.CUSTOMER)).toBe(false);
  expect(roleHasAdminAccess(null)).toBe(false);

  // Retired/unknown roles must never inherit administrative access.
  expect(roleHasAdminAccess('staff')).toBe(false);
  expect(roleHasAdminAccess('platform_admin')).toBe(false);
});

test('the restaurant service exposes only the deployment restaurant', async () => {
  const restaurant = await getRestaurantById('restaurant-pizza-demo');
  expect(restaurant).toBeNull();
  expect(await getRestaurantById('another-restaurant')).toBeNull();
});