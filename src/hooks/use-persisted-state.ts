'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(defaultValue);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored !== null) {
        setState(JSON.parse(stored) as T);
      }
    } catch {
      // ignore
    }
    hydrated.current = true;
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // sessionStorage might be full or unavailable
    }
  }, [key, state]);

  return [state, setState];
}

export function usePersistedCallback<T extends unknown[]>(
  key: string,
  fn: (...args: T) => void
): (...args: T) => void {
  return useCallback((...args: T) => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(args[0]));
    } catch {
      // ignore
    }
    fn(...args);
  }, [key, fn]);
}