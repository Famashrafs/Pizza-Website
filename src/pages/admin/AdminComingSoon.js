import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';

// Reusable placeholder for admin sub-sections that have not been built yet.
// The owner sees a clear explanation of what the feature will do and a
// working link back to the dashboard. No fake functionality is presented.
function AdminComingSoon({ icon, title, description }) {
  return (
    <div className="admin-overview admin-coming-soon">
      <div className="admin-coming-soon-panel">
        <span className="admin-coming-soon-icon">
          <FontAwesomeIcon icon={icon} />
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
        <Link to="/admin" className="contact-btn admin-coming-back">
          <FontAwesomeIcon icon={faArrowLeft} /> Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default AdminComingSoon;