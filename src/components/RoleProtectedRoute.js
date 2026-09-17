import React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faUser, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ADMIN_ROLES, getRoleMeta, normalizeRole } from '../config/roles';

// Shown when a signed-in user lacks the required role. It never reveals admin
// structure and always offers a safe exit back to the customer experience.
function AccessDenied({ requiredRoles }) {
  const { role, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const currentRole = getRoleMeta(normalizeRole(role));

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      showToast('Successfully logged out');
      navigate('/', { replace: true });
    }
  };

  const restricted =
    requiredRoles && requiredRoles.length
      ? requiredRoles.map(getRoleMeta).map((meta) => meta.label).join(', ')
      : 'a restaurant owner';

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">RESTRICTED AREA</h1>
      </div>
      <div className="auth-card auth-card--notice">
        <span className="role-denied-icon">
          <FontAwesomeIcon icon={faLock} />
        </span>
        <h2>Restaurant Owner area</h2>
        <p>
          This area is reserved for {restricted}. Your current account (
          {currentRole.label}) does not have access to the restaurant dashboard.
        </p>
        <div className="role-denied-actions">
          <Link to="/account" className="contact-btn">
            <FontAwesomeIcon icon={faUser} /> Go to My Account
          </Link>
          <button
            type="button"
            className="menu-btn"
            onClick={handleLogout}
          >
            <FontAwesomeIcon icon={faRightFromBracket} /> Log Out
          </button>
        </div>
      </div>
    </div>
  );
}

// Route guard that protects the /admin area (and any future role-gated route).
//
//   <RoleProtectedRoute roles={ADMIN_ROLES}><AdminLayout /></RoleProtectedRoute>
//
// - Unauthenticated users are sent to /login and returned to where they were.
// - Authenticated users without an allowed role see the AccessDenied screen
//   instead of the protected content.
// - Server-side authorization is documented in `firestore.rules`; client-side
//   guards are never the only line of defense in production.
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
    return <AccessDenied requiredRoles={roles} />;
  }

  return children;
}

export default RoleProtectedRoute;