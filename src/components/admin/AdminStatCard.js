import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// Dashboard statistic card. When `loading` it renders a skeleton so the grid
// never flashes empty. Optional `to` turns it into a link.
function AdminStatCard({ icon, label, value, hint, tone = 'gold', to, loading }) {
  const Tone = tone;

  const body = (
    <div className="admin-stat-card">
      <span className={`admin-stat-icon is-${Tone}`}>
        <FontAwesomeIcon icon={icon} />
      </span>
      <div className="admin-stat-body">
        <span className="admin-stat-value">
          {loading ? <span className="admin-skeleton-chip" /> : value}
        </span>
        <span className="admin-stat-label">{label}</span>
        {!loading && hint && <span className="admin-stat-hint">{hint}</span>}
      </div>
    </div>
  );

  return to ? (
    <Link to={to} className="admin-stat-link">
      {body}
    </Link>
  ) : (
    body
  );
}

export default AdminStatCard;