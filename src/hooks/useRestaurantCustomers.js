import { useLiveData } from './useLiveData';
import {
  getRestaurantCustomers,
  subscribeCustomers,
} from '../services/customerService';

export function useRestaurantCustomers(restaurantId) {
  const { status, data, error, reload } = useLiveData(
    () => (restaurantId ? getRestaurantCustomers(restaurantId) : []),
    [restaurantId],
    { subscribe: (listener) => subscribeCustomers(listener, { restaurantId }) }
  );
  return { status, customers: data || [], error, reload };
}

export default useRestaurantCustomers;
