import { useState, useEffect } from 'react';

/**
 * Hook that debounces a value.
 *
 * @param value - The value to debounce
 * @param delay - The debounce delay in milliseconds
 * @returns A tuple of [debouncedValue, isDebouncing]
 */
export function useDebouncedValue<T>(value: T, delay: number): [T, boolean] {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const [isDebouncing, setIsDebouncing] = useState(false);

  useEffect(() => {
    setIsDebouncing(true);

    const handler = setTimeout(() => {
      setDebouncedValue(value);
      setIsDebouncing(false);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return [debouncedValue, isDebouncing];
}
