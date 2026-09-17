import React from 'react';

function SkeletonCard() {
  return (
    <div className="product-card skeleton-card" aria-hidden="true">
      <div className="skeleton skeleton-img" />
      <div className="skeleton skeleton-line w70" />
      <div className="skeleton skeleton-line w95" />
      <div className="skeleton skeleton-line w50" />
      <div className="skeleton skeleton-btn" />
    </div>
  );
}

export default SkeletonCard;