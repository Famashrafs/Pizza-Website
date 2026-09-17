import React from 'react';
import { useAuth } from '../context/AuthContext';
import AuthPrompt from './AuthPrompt';

function RequireAuth({ children, title, message }) {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return (
      <AuthPrompt fullPage title={title} message={message} />
    );
  }

  return children;
}

export default RequireAuth;