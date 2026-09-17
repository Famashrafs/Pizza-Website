import React, { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  faDollarSign,
  faReceipt,
  faUsers,
  faUtensils,
} from '@fortawesome/free-solid-svg-icons';
import { useAdminData } from '../../hooks/useAdminData';
import { RESTAURANT_SETTINGS } from '../../config/restaurant';
import SectionTitle from '../../components/account/SectionTitle';
import AdminStatCard from '../../components/admin/AdminStatCard';
import QuickActions from '../../components/admin/QuickActions';
import SalesOverview from '../../components/admin/SalesOverview';
import RecentOrders from '../../components/admin/RecentOrders';
import DashboardSkeleton from '../../components/admin/DashboardSkeleton';
import AdminErrorState from '../../components/admin/AdminErrorState';

function AdminDashboard() {
  const { restaurant, restaurantLoading, restaurantError, reloadRestaurant } =
    useOutletContext();

  const restaurantId = restaurant?.id || null;

  const {
    status,
    orders,
    stats,
    error: dataError,
    reload,
  } = useAdminData(restaurantId);

  const currency = RESTAURANT_SETTINGS.currency || '$';

  const statCards = useMemo(
    () => [
      {
        icon: faDollarSign,
        label: "Today's Revenue",
        value: `${currency}${stats.todayRevenue.toFixed(2)}`,
        hint: 'Collected from today’s orders',
        tone: 'gold',
        loading: status === 'loading',
      },
      {
        icon: faReceipt,
        label: "Today's Orders",
        value: String(stats.todayOrders),
        hint:
          stats.todayOrders === 1
            ? '1 order placed today'
            : `${stats.todayOrders} orders placed today`,
        tone: 'green',
        loading: status === 'loading',
      },
      {
        icon: faUsers,
        label: 'Customers',
        value: String(stats.totalCustomers),
        hint: 'Customers who have ordered',
        tone: 'coral',
        loading: status === 'loading',
      },
      {
        icon: faUtensils,
        label: 'Products',
        value: String(stats.totalProducts),
        hint:
          stats.totalProducts === 1
            ? '1 item on the menu'
            : `${stats.totalProducts} items on the menu`,
        tone: 'blue',
        loading: status === 'loading',
      },
    ],
    [stats, status, currency]
  );

  return (
    <div className="dash-section admin-overview">
      <div className="dash-section-head">
        <SectionTitle
          title="Dashboard"
          subtitle={
            restaurantLoading
              ? 'Loading your restaurant…'
              : restaurant
              ? `Overview of ${restaurant.name}`
              : 'Overview of your restaurant'
          }
        />
      </div>

      {(restaurantError || (dataError && status === 'error')) && (
        <AdminErrorState
          message={dataError || restaurantError || 'Unable to load dashboard data.'}
          onRetry={restaurantError ? reloadRestaurant : reload}
        />
      )}

      {(status === 'loading' || restaurantLoading) && <DashboardSkeleton />}

      {status === 'success' && !restaurantLoading && !restaurantError && (
        <>
          <div className="admin-stat-grid">
            {statCards.map((card) => (
              <AdminStatCard
                key={card.label}
                icon={card.icon}
                label={card.label}
                value={card.value}
                hint={card.hint}
                tone={card.tone}
                loading={card.loading}
              />
            ))}
          </div>

          <QuickActions />

          <SalesOverview orders={orders} status={status} error={dataError} onRetry={reload} />

          <RecentOrders orders={orders} status={status} error={dataError} onRetry={reload} />
        </>
      )}

    </div>
  );
}

export default AdminDashboard;