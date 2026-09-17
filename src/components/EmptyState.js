import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';

function EmptyState({ title, message, actionLabel, onAction, icon }) {
  return (
    <div className="empty-state">
      <FontAwesomeIcon
        icon={icon || faMagnifyingGlass}
        className="empty-state-icon"
      />
      {title && <h3>{title}</h3>}
      <p>{message}</p>
      {actionLabel && onAction && (
        <button className="contact-btn empty-state-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;