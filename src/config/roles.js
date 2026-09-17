// Canonical role system for the platform.
//
// Only `customer` and `restaurant_owner` are fully implemented in this phase.
// The other roles are defined here (and guarded in the admin area) so future
// features (staff accounts, multi-branch admins, platform operations) can be
// added without restructuring the application.
//
// IMPORTANT: Roles stored on the client are a convenience for rendering and
// route guards only. Authorization must also be enforced server-side — see
// `firestore.rules` at the repository root. Never trust a role that exists
// only on the client as the sole source of truth.

export const ROLES = {
  CUSTOMER: 'customer',
  RESTAURANT_OWNER: 'restaurant_owner',
  RESTAURANT_ADMIN: 'restaurant_admin',
  STAFF: 'staff',
  PLATFORM_ADMIN: 'platform_admin',
};

// Fallback for any profile that has no stored role (e.g. accounts created
// before the role system existed).
export const DEFAULT_ROLE = ROLES.CUSTOMER;

// Every role that is allowed inside the /admin area. This list drives the
// RoleProtectedRoute guard; the guard only opens doors for these roles.
export const ADMIN_ROLES = [
  ROLES.RESTAURANT_OWNER,
  ROLES.RESTAURANT_ADMIN,
  ROLES.STAFF,
  ROLES.PLATFORM_ADMIN,
];

export const ROLE_META = {
  [ROLES.CUSTOMER]: {
    label: 'Customer',
    description: 'Browses the store and places orders.',
  },
  [ROLES.RESTAURANT_OWNER]: {
    label: 'Restaurant Owner',
    description: 'Owns and manages a restaurant from the admin dashboard.',
  },
  [ROLES.RESTAURANT_ADMIN]: {
    label: 'Restaurant Admin',
    description: 'Full operational access to one restaurant. (Reserved for a future phase.)',
  },
  [ROLES.STAFF]: {
    label: 'Staff',
    description: 'Restricted operational access. (Reserved for a future phase.)',
  },
  [ROLES.PLATFORM_ADMIN]: {
    label: 'Platform Admin',
    description: 'Administers the whole platform. (Reserved for a future phase.)',
  },
};

export function normalizeRole(role) {
  return ROLE_META[role] ? role : DEFAULT_ROLE;
}

export function getRoleMeta(role) {
  return ROLE_META[normalizeRole(role)] || ROLE_META[DEFAULT_ROLE];
}

export function roleHasAdminAccess(role) {
  return ADMIN_ROLES.includes(normalizeRole(role));
}

export default ROLES;