import { useCallback, useEffect, useState } from 'react';
import { getOrderForUser } from '../services/orderService';

export function useOrder(id, uid) {
  const [state, setState] = useState({
    status: 'loading',
    order: null,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'loading' }));

    const timer = setTimeout(() => {
      try {
        if (cancelled) return;
        const order = getOrderForUser(id, uid);
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
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, uid, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, reload };
}

export default useOrder;