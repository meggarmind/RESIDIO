'use client';

import { useSyncExternalStore, useCallback } from 'react';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window === 'undefined') return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener('change', callback);
      return () => mq.removeEventListener('change', callback);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Preset breakpoint hooks matching Tailwind defaults
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)');
}

export function useIsLargeScreen(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 768px)');
}
