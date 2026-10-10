import React from 'react';
import { useAuth } from '../context/AuthContext';
import AuthPrompt from './AuthPrompt';

function RequireAuth({ children, title, message }) {
  const { currentUser, isGuest } = useAuth();

  // Anonymous guests are intentionally treated as signed-out here so they can
  // never reach account-only pages (profile, orders, addresses, favorites).
  if (!currentUser || isGuest) {
    return (
      <AuthPrompt fullPage title={title} message={message} />
    );
  }

  return children;
}

export default RequireAuth;