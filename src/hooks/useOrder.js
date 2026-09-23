import { useCallback, useEffect, useState } from 'react';
import {
  getOrderForUser,
  subscribeCustomerOrders,
} from '../services/orderService';

// Live order tracking for one customer. The initial load shows the loading
// state; a scoped subscription (customerId) re-reads the order whenever the
// customer's orders change so status updates from the restaurant appear live.
export function useOrder(id, uid) {
  const [state, setState] = useState({
    status: 'loading',
    order: null,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const order = await getOrderForUser(id, uid);
        if (cancelled) return;
        setState({
          status: order ? 'success' : 'notfound',
          order,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: 'error',
          order: null,
          error: 'We could not load this order. Please try again.',
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
  }, [id, uid, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, reload };
}

export default useOrder;