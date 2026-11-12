import { useSyncExternalStore } from 'react';

export type Params = Partial<Record<string, string>>;

// The pages above this one in its tab, nearest last, so Back goes where you came from.
// Pushed means the browser's previous entry is that nearest page, so Back can simply go back in history.
export interface Trail {
  href: string;
  title: string;
}

interface PageState {
  trail: Trail[];
  pushed?: boolean;
}

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener('popstate', listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
};

export const pageState = (): PageState => (Array.isArray(history.state?.trail) ? history.state : { trail: [] });

export const navigate = (href: string, state: PageState = { trail: [] }, replace = false) => {
  history[replace ? 'replaceState' : 'pushState'](state, '', href);
  window.scrollTo(0, 0);
  listeners.forEach((listener) => listener());
};

// Back to the page above, by going back in history when that's where it is.
export const goBack = (href: string) => {
  const { trail, pushed } = pageState();
  const parent = trail.at(-1)?.href === href;

  if (parent && pushed) {
    history.back();
  } else {
    navigate(href, { trail: parent ? trail.slice(0, -1) : [] }, true);
  }
};

export const useLocation = () => useSyncExternalStore(subscribe, () => location.pathname + location.search);