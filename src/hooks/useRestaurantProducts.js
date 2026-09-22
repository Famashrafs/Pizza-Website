import { useLiveData } from './useLiveData';
import {
  getProductsForRestaurant,
  subscribeProducts,
} from '../services/menuService';

// Live list of the signed-in owner's products. Updates automatically whenever
// the catalog changes anywhere in the app (or another tab).
export function useRestaurantProducts(restaurantId) {
  const { status, data, error, reload } = useLiveData(
    () => (restaurantId ? getProductsForRestaurant(restaurantId) : []),
    [restaurantId],
    { subscribe: subscribeProducts }
  );
  return { status, products: data || [], error, reload };
}

export default useRestaurantProducts;
