import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUser,
  faStore,
} from '@fortawesome/free-solid-svg-icons';

function AuthChoice() {
  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">
          LOGIN
        </h1>
      </div>

      <div className="auth-card">
        <h2>Welcome to Pizza</h2>

        <p className="auth-subtitle">
          Choose how you want to continue
        </p>

        <div className="auth-choice-grid">
          <Link
            to="/login/customer"
            className="auth-choice-card"
          >
            <FontAwesomeIcon
              icon={faUser}
              className="auth-choice-icon"
            />

            <h3>Customer</h3>

            <p>
              Order pizza, track your orders,
              manage favorites and your account.
            </p>

            <span>
              Customer Login →
            </span>
          </Link>

          <Link
            to="/admin/login"
            className="auth-choice-card"
          >
            <FontAwesomeIcon
              icon={faStore}
              className="auth-choice-icon"
            />

            <h3>Restaurant Admin</h3>

            <p>
              Manage your restaurant, menu,
              orders, customers and dashboard.
            </p>

            <span>
              Admin Login →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AuthChoice;