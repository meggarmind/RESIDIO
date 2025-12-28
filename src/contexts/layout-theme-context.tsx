'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useIsDesktop } from '@/hooks/use-media-query';

export type LayoutTheme = 'auto' | 'compact' | 'expanded';

interface LayoutThemeContextType {
  /** User's preference: auto, compact, or expanded */
  theme: LayoutTheme;
  /** Resolved theme based on preference and viewport */
  effectiveTheme: 'compact' | 'expanded';
  /** Update the theme preference */
  setTheme: (theme: LayoutTheme) => void;
  /** Shorthand for effectiveTheme === 'expanded' */
  isExpanded: boolean;
}

const LayoutThemeContext = createContext<LayoutThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'residio-layout-theme';

export function LayoutThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<LayoutTheme>('auto');
  const [mounted, setMounted] = useState(false);
  const isDesktop = useIsDesktop();

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as LayoutTheme | null;
      if (stored && ['auto', 'compact', 'expanded'].includes(stored)) {
        setThemeState(stored);
      }
    } catch {
      // localStorage not available (SSR or privacy mode)
    }
  }, []);

  const setTheme = useCallback((newTheme: LayoutTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // localStorage not available
    }
  }, []);

  // Resolve effective theme based on preference and viewport
  const effectiveTheme = useMemo((): 'compact' | 'expanded' => {
    if (theme === 'auto') {
      return isDesktop ? 'expanded' : 'compact';
    }
    return theme;
  }, [theme, isDesktop]);

  const isExpanded = effectiveTheme === 'expanded';

  // Apply class to document for CSS-based theming
  useEffect(() => {
    if (!mounted) return;

    document.documentElement.classList.remove('layout-compact', 'layout-expanded');
    document.documentElement.classList.add(`layout-${effectiveTheme}`);
  }, [effectiveTheme, mounted]);

  // Prevent hydration mismatch by using consistent initial value
  const value = useMemo(
    () => ({
      theme,
      effectiveTheme: mounted ? effectiveTheme : 'compact',
      setTheme,
      isExpanded: mounted ? isExpanded : false,
    }),
    [theme, effectiveTheme, setTheme, isExpanded, mounted]
  );

  return (
    <LayoutThemeContext.Provider value={value}>
      {children}
    </LayoutThemeContext.Provider>
  );
}

export function useLayoutTheme() {
  const context = useContext(LayoutThemeContext);
  if (!context) {
    throw new Error('useLayoutTheme must be used within LayoutThemeProvider');
  }
  return context;
}
