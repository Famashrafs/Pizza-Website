import { useCallback, useEffect, useRef, useState } from 'react';
import { devLog } from '../utils/devLog';

// Generic live-data hook. Runs a loader (sync or async), exposes a loading/
// success/error state, and re-runs whenever the subscribed collection changes
// (a write from anywhere in the app, or another tab). This is how the
// dashboard becomes reactive without polling.
export function useLiveData(load, deps = [], { subscribe } = {}) {
  const [state, setState] = useState({
    status: 'loading',
    data: null,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const data = await loadRef.current();
        if (!cancelled) setState({ status: 'success', data, error: null });
      } catch (err) {
        if (!cancelled) {
          devLog('[useLiveData] failed to load data', err);
          setState({
            status: 'error',
            data: null,
            error: 'Unable to load this data. Please try again.',
          });
        }
      }
    };

    setState((prev) => ({ ...prev, status: 'loading' }));
    run();

    const unsubscribe = subscribe ? subscribe(run) : null;
    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, ...deps]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, reload };
}

export default useLiveData;