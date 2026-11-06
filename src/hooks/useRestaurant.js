import { useCallback, useEffect, useState } from 'react';
import {
  getRestaurantById,
  subscribeRestaurant,
} from '../services/restaurantService';
import { RESTAURANT_ID } from '../config/restaurant';

// Loads the single deployment restaurant for the admin layout. Both the owner
// and owner-granted admins resolve the same fixed document, so an admin can
// work in the dashboard without being the restaurant's ownerId.
export function useRestaurant() {
  const [state, setState] = useState({
    status: 'loading',
    restaurant: null,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'loading' }));

    const load = () => {
      getRestaurantById(RESTAURANT_ID).then(
        (restaurant) => {
          if (cancelled) return;
          setState({ status: 'success', restaurant, error: null });
        },
        () => {
          if (cancelled) return;
          setState({
            status: 'error',
            restaurant: null,
            error: 'We could not load the restaurant. Please try again.',
          });
        }
      );
    };

    load();
    const unsubscribe = subscribeRestaurant(load);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, reload };
}

export default useRestaurant;
