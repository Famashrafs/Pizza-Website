// Smoke tests for the platform foundation that don't require a live Firebase
// project (the previous template test rendered the whole App, which needs
// Firebase env config that CI does not have).

import { normalizeRole, roleHasAdminAccess, ROLES } from './config/roles';
import { onboardOwnerRestaurant, getOwnerRestaurant } from './services/restaurantService';

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
  beforeEach(() => {
    localStorage.clear();
  });

  test('onboarding links an owner to a restaurant', () => {
    const restaurant = onboardOwnerRestaurant({ ownerId: 'owner-1', name: 'Slice House' });
    expect(restaurant.ownerId).toBe('owner-1');
    expect(getOwnerRestaurant('owner-1')?.id).toBe(restaurant.id);
  });
});