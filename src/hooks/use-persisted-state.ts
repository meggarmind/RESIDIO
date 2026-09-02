'use client';

import { useState, useCallback, useRef } from 'react';

export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch {
      // ignore
    }
    return defaultValue;
  });
  const stateRef = useRef(state);

  const setPersistedState = useCallback((value: T | ((prev: T) => T)) => {
    const nextState = typeof value === 'function'
      ? (value as (prev: T) => T)(stateRef.current)
      : value;

    stateRef.current = nextState;
    setState(nextState);
    try {
      window.sessionStorage.setItem(key, JSON.stringify(nextState));
    } catch {
      // sessionStorage might be full or unavailable
    }
  }, [key]);

  return [state, setPersistedState];
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
