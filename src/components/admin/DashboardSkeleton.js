import React from 'react';

// Full-page loading state for the dashboard overview while data loads.
function DashboardSkeleton() {
  return (
    <div className="admin-dashboard-skeleton" aria-busy="true" aria-label="Loading dashboard">
      <div className="admin-skeleton-title">
        <div className="dash-skeleton-line" style={{ width: 180, height: 22 }} />
        <div className="dash-skeleton-line" style={{ width: 260, height: 13 }} />
      </div>
      <div className="admin-stat-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="dash-card--skeleton admin-stat-skeleton" />
        ))}
      </div>
      <div className="admin-quick-actions admin-quick-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="dash-card--skeleton" />
        ))}
      </div>
      <div className="admin-panel admin-panel-skeleton">
        <div className="dash-skeleton-line" style={{ width: 200, height: 20 }} />
        <div className="dash-skeleton-line" style={{ width: '100%', height: 240, marginTop: 18 }} />
      </div>
      <div className="admin-panel admin-panel-skeleton">
        <div className="dash-skeleton-line" style={{ width: 200, height: 20 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="dash-skeleton-line" style={{ height: 34, marginTop: 14 }} />
        ))}
      </div>
    </div>
  );
}

export default DashboardSkeleton;