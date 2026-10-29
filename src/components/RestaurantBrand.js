import React from 'react';
import { RESTAURANT_SETTINGS } from '../config/restaurant';

const BRAND_NAME = RESTAURANT_SETTINGS.name || 'Restro';

export function BrandMark({ className = 'site-logo-mark' }) {
  if (RESTAURANT_SETTINGS.logo) {
    return <img src={RESTAURANT_SETTINGS.logo} alt="" className={className} />;
  }
  return <span className={className}>{BRAND_NAME.charAt(0)}</span>;
}

export function BrandName() {
  if (BRAND_NAME === 'Pizza') {
    return (
      <>
        Pi<em>zz</em>a
      </>
    );
  }
  return <>{BRAND_NAME}</>;
}
