import { useLiveData } from './useLiveData';
import {
  getCategoriesForRestaurant,
  subscribeCategories,
} from '../services/categoryService';

export function useRestaurantCategories(restaurantId) {
  const { status, data, error, reload } = useLiveData(
    () => (restaurantId ? getCategoriesForRestaurant(restaurantId) : []),
    [restaurantId],
    { subscribe: subscribeCategories }
  );
  return { status, categories: data || [], error, reload };
}

export default useRestaurantCategories;
