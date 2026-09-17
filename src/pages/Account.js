import React, { useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { normalizeAccount } from '../services/accountService';
import AccountSidebar from '../components/account/AccountSidebar';
import AccountHeader from '../components/account/AccountHeader';

function Account() {
  const { currentUser, userProfile } = useAuth();
  const account = useMemo(
    () => normalizeAccount(currentUser?.uid, currentUser),
    // userProfile changes when profile data is saved; recompute the model then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, userProfile]
  );

  return (
    <div className="auth-page">
      <div className="landing-page">
        <h1 className="landing-title">MY ACCOUNT</h1>
      </div>
      <div className="dashboard-shell">
        <AccountSidebar />
        <main className="dashboard-main">
          <AccountHeader account={account} />
          <Outlet context={{ account }} />
        </main>
      </div>
    </div>
  );
}

export default Account;