import { useCallback, useEffect, useState } from 'react';
import { getRestaurantOrders, subscribeOrders } from '../services/orderService';
import {
  getProductsForRestaurant,
  subscribeProducts,
} from '../services/menuService';
import { computeDashboardStats } from '../services/adminService';

// Loads everything the dashboard overview needs for one restaurant and derives
// the statistics from that real data. Nothing here is faked: when the store is
// empty the numbers are zero and the UI renders its empty states. The hooks
// re-run on any order/product change so the dashboard is live.
export function useAdminData(restaurantId) {
  const [state, setState] = useState({
    status: 'loading',
    orders: [],
    products: [],
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      try {
        const orders = getRestaurantOrders(restaurantId);
        const products = getProductsForRestaurant(restaurantId);
        if (cancelled) return;

        setState({
          status: 'success',
          orders,
          products,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: 'error',
          orders: [],
          products: [],
          error: 'Unable to load dashboard data.',
        });
      }
    };

    setState((prev) => ({ ...prev, status: 'loading' }));
    load();

    const unsubscribeOrders = subscribeOrders(load);
    const unsubscribeProducts = subscribeProducts(load);

    return () => {
      cancelled = true;
      unsubscribeOrders();
      unsubscribeProducts();
    };
  }, [restaurantId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const stats = computeDashboardStats({
    orders: state.orders,
    products: state.products,
  });

  return {
    status: state.status,
    orders: state.orders,
    products: state.products,
    stats,
    error: state.error,
    reload,
  };
}

export default useAdminData;