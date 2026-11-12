import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener('popstate', listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
};

export const navigate = (href: string) => {
  history.pushState(null, '', href);
  window.scrollTo(0, 0);
  listeners.forEach((listener) => listener());
};

export const useLocation = () => useSyncExternalStore(subscribe, () => location.pathname + location.search);