import { useCallback, useEffect, useState } from 'react';
import {
  getUserOrders,
  subscribeCustomerOrders,
} from '../services/orderService';

// Live order history for one customer. A scoped subscription (customerId)
// refreshes the list whenever the customer's orders change, e.g. when a
// restaurant advances the status. The initial load shows the loading state;
// real-time refreshes apply in place without flicker.
export function useOrders(uid) {
  const [state, setState] = useState({
    status: 'loading',
    orders: [],
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const orders = await getUserOrders(uid);
        if (cancelled) return;
        setState({
          status: 'success',
          orders,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: 'error',
          orders: [],
          error: 'We could not load your orders. Please try again.',
        });
      }
    };

    setState((prev) => ({ ...prev, status: 'loading' }));
    load();

    const unsubscribe = uid
      ? subscribeCustomerOrders(load, { customerId: uid })
      : null;

    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [uid, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, reload };
}

export default useOrders;