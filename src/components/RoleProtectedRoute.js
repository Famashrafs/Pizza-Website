import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ADMIN_ROLES, normalizeRole } from '../config/roles';

// Route guard that protects the /admin area (and any future role-gated route).
//
//   <RoleProtectedRoute roles={ADMIN_ROLES}><AdminLayout /></RoleProtectedRoute>
//
// Behaviour:
// - Anonymous visitors are sent to /login and returned to where they were.
// - Signed-in users without an allowed role are redirected to their customer
//   account area (/account) — the admin dashboard is never shown to them.
//
// AuthProvider does not render the routes until the session/profile request has
// finished (it shows a "Checking authentication…" state), so this guard never
// runs with a stale/unknown user and never redirects early.
//
// Server-side authorization is documented in `firestore.rules`; client-side
// guards are never the only line of defense in production.
export function RoleProtectedRoute({ children, roles = ADMIN_ROLES }) {
  const { currentUser, role } = useAuth();
  const location = useLocation();

  if (!currentUser) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (!roles.includes(normalizeRole(role))) {
    return <Navigate to="/account" replace />;
  }

  return children;
}

export default RoleProtectedRoute;
