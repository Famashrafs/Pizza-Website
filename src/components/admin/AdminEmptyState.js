import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInbox } from '@fortawesome/free-solid-svg-icons';

// Reusable empty state for the admin dashboard. Explains that there is nothing
// yet and what the owner can do next — without inventing data.
function AdminEmptyState({ icon, title, message, actionLabel, actionTo, onAction }) {
  const action = actionTo ? (
    <Link to={actionTo} className="contact-btn admin-empty-action">
      {actionLabel}
    </Link>
  ) : actionLabel && onAction ? (
    <button type="button" className="contact-btn admin-empty-action" onClick={onAction}>
      {actionLabel}
    </button>
  ) : null;

  return (
    <div className="admin-empty">
      <span className="admin-empty-icon">
        <FontAwesomeIcon icon={icon || faInbox} />
      </span>
      {title && <h4>{title}</h4>}
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export default AdminEmptyState;