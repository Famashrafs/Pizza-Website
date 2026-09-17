import { useCallback, useEffect, useState } from 'react';
import { getUserOrders } from '../services/orderService';

function loadOrders(uid) {
  return getUserOrders(uid);
}

export function useOrders(uid) {
  const [state, setState] = useState({
    status: 'loading',
    orders: [],
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'loading' }));

    // Small latency so the loading skeleton is visible; storage itself is sync.
    const timer = setTimeout(() => {
      try {
        if (cancelled) return;
        const orders = loadOrders(uid);
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
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uid, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, reload };
}

export default useOrders;