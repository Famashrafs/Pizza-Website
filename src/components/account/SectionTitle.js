import React from 'react';

function SectionTitle({ title, subtitle, icon }) {
  return (
    <div className="dash-section-title">
      {icon && <span className="dash-section-icon">{icon}</span>}
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

export default SectionTitle;