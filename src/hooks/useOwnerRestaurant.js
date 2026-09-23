import { useCallback, useEffect, useState } from 'react';
import {
  fetchOwnerRestaurant,
  subscribeRestaurant,
} from '../services/restaurantService';

// Loads the restaurant record that belongs to an owner. Returns a normalized
// { status, restaurant, error, reload } state used by the admin layout.
export function useOwnerRestaurant(ownerId) {
  const [state, setState] = useState({
    status: 'loading',
    restaurant: null,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'loading' }));

    if (!ownerId) {
      setState({ status: 'success', restaurant: null, error: null });
      return undefined;
    }

    const load = () => {
      fetchOwnerRestaurant(ownerId).then(
        (restaurant) => {
          if (cancelled) return;
          setState({ status: 'success', restaurant, error: null });
        },
        () => {
          if (cancelled) return;
          setState({
            status: 'error',
            restaurant: null,
            error: 'We could not load your restaurant. Please try again.',
          });
        }
      );
    };

    load();
    const unsubscribe = subscribeRestaurant(load, { ownerId });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [ownerId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, reload };
}

export default useOwnerRestaurant;