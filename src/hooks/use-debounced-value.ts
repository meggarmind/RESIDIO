import { useDeferredValue } from 'react';

/** Returns a deferred (debounced) version of the value using React's concurrent scheduler. */
export function useDebouncedValue<T>(value: T, _delay?: number): [T, boolean] {
  const deferred = useDeferredValue(value);
  const isDebouncing = deferred !== value;
  return [deferred, isDebouncing];
}
