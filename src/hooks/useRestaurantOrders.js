import { useLiveData } from './useLiveData';
import { getRestaurantOrders, subscribeOrders } from '../services/orderService';

// Live list of orders for one restaurant. New orders and status changes push
// straight into the UI through the collection subscription.
export function useRestaurantOrders(restaurantId) {
  const { status, data, error, reload } = useLiveData(
    () => (restaurantId ? getRestaurantOrders(restaurantId) : []),
    [restaurantId],
    { subscribe: (listener) => subscribeOrders(listener, { restaurantId }) }
  );
  return { status, orders: data || [], error, reload };
}

export default useRestaurantOrders;
