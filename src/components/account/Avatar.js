import React from 'react';

function Avatar({ name, photoURL, size = 'md' }) {
  const initials = (name || '?')
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <span className={`dash-avatar dash-avatar-${size}`}>
      {photoURL ? (
        <img src={photoURL} alt={name || 'Profile'} />
      ) : (
        <span className="dash-avatar-initials">{initials}</span>
      )}
    </span>
  );
}

export default Avatar;