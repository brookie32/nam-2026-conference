import { useSyncExternalStore } from 'react';

/**
 * Whether the browser thinks it has a network. `reconnects` counts `online`
 * events so a fetch hook can list it as a dependency and refetch on return.
 */
let reconnects = 0;
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { reconnects += 1; notify(); });
  window.addEventListener('offline', notify);
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
export const useReconnects = () => useSyncExternalStore(subscribe, () => reconnects, () => 0);
