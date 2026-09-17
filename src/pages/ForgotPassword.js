import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { forgotPassword, authError } = useAuth();
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await forgotPassword(email);
    if (result.success) {
      setSent(true);
      showToast('Password reset email sent!');
    }
  };

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">RESET PASSWORD</h1>
      </div>
      <div className="auth-card">
        <h2>Forgot Password</h2>
        <p className="auth-subtitle">
          Enter your email and we'll send you a reset link.
        </p>
        {sent ? (
          <>
            <div className="auth-success">
              We've sent a reset link to <strong>{email}</strong>. Check your
              inbox.
            </div>
            <Link to="/login" className="contact-btn empty-cart-btn">
              Back to Login
            </Link>
          </>
        ) : (
          <>
            {authError && <p className="auth-error">{authError}</p>}
            <form className="auth-form" onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="contact-btn">
                Send Reset Link
              </button>
            </form>
            <p className="auth-switch">
              Remembered? <Link to="/login">Login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default ForgotPassword;