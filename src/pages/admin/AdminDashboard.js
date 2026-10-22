import React, { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  faDollarSign,
  faReceipt,
  faUsers,
  faUtensils,
} from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { useAdminData } from '../../hooks/useAdminData';
import { formatMoney } from '../../i18n/format';
import SectionTitle from '../../components/account/SectionTitle';
import AdminStatCard from '../../components/admin/AdminStatCard';
import QuickActions from '../../components/admin/QuickActions';
import SalesOverview from '../../components/admin/SalesOverview';
import RecentOrders from '../../components/admin/RecentOrders';
import DashboardSkeleton from '../../components/admin/DashboardSkeleton';
import AdminErrorState from '../../components/admin/AdminErrorState';

function AdminDashboard() {
  const { t, i18n } = useTranslation();
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

  const statCards = useMemo(
    () => [
      {
        icon: faDollarSign,
        label: t('admin.statTodayRevenue'),
        value: formatMoney(stats.todayRevenue, i18n.language),
        hint: t('admin.statTodayRevenueHint'),
        tone: 'gold',
        loading: status === 'loading',
      },
      {
        icon: faReceipt,
        label: t('admin.statTodayOrders'),
        value: String(stats.todayOrders),
        hint: t('admin.statOrdersPlacedToday', { count: stats.todayOrders }),
        tone: 'green',
        loading: status === 'loading',
      },
      {
        icon: faUsers,
        label: t('admin.statCustomers'),
        value: String(stats.totalCustomers),
        hint: t('admin.statCustomersHint'),
        tone: 'coral',
        loading: status === 'loading',
      },
      {
        icon: faUtensils,
        label: t('admin.statProducts'),
        value: String(stats.totalProducts),
        hint: t('admin.statItemsOnMenu', { count: stats.totalProducts }),
        tone: 'blue',
        loading: status === 'loading',
      },
    ],
    [stats, status, t, i18n.language]
  );

  return (
    <div className="dash-section admin-overview">
      <div className="dash-section-head">
        <SectionTitle
          title={t('admin.titleDashboard')}
          subtitle={
            restaurantLoading
              ? t('admin.loadingRestaurant')
              : restaurant
              ? t('admin.overviewOf', { name: restaurant.name })
              : t('admin.overviewOfRestaurant')
          }
        />
      </div>

      {(restaurantError || (dataError && status === 'error')) && (
        <AdminErrorState
          message={dataError || restaurantError || t('admin.errorLoadDashboard')}
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