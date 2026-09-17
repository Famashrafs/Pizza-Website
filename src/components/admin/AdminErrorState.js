import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faRotateRight } from '@fortawesome/free-solid-svg-icons';

// Reusable error state for async admin sections. Shows a friendly message and a
// retry button; raw backend errors are never surfaced to the user here.
function AdminErrorState({ message, onRetry }) {
  return (
    <div className="admin-error">
      <span className="admin-error-icon">
        <FontAwesomeIcon icon={faTriangleExclamation} />
      </span>
      <p>{message || 'Something went wrong while loading this section.'}</p>
      {onRetry && (
        <button type="button" className="menu-btn admin-error-action" onClick={onRetry}>
          <FontAwesomeIcon icon={faRotateRight} /> Try Again
        </button>
      )}
    </div>
  );
}

export default AdminErrorState;