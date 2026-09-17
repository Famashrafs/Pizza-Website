import React, { useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useOwnerRestaurant from '../../hooks/useOwnerRestaurant';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';

function AdminLayout() {
  const { currentUser } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { status, restaurant, error, reload } = useOwnerRestaurant(
    currentUser?.uid
  );

  const context = useMemo(
    () => ({
      restaurant,
      restaurantLoading: status === 'loading',
      restaurantError: status === 'error' ? error : null,
      reloadRestaurant: reload,
    }),
    [restaurant, status, error, reload]
  );

  return (
    <div className="admin-root">
      <AdminSidebar
        restaurant={restaurant}
        restaurantLoading={status === 'loading'}
        owner={currentUser}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="admin-main">
        <AdminHeader
          restaurant={restaurant}
          restaurantLoading={status === 'loading'}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
        <main className="admin-content">
          <Outlet context={context} />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;