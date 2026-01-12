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
import { useTheme } from 'next-themes';
import type { VisualTheme, ThemeContext } from '@/lib/themes/types';
import { getDefaultTheme, getThemeById, isValidThemeId } from '@/lib/themes/registry';
import { useEffectiveTheme } from '@/hooks/use-theme-preferences';

interface VisualThemeContextType {
  /** Current visual theme */
  theme: VisualTheme;
  /** Theme ID */
  themeId: string;
  /** Change the visual theme */
  setThemeId: (id: string) => void;
  /** Whether the theme is loading */
  isLoading: boolean;
}

const VisualThemeContext = createContext<VisualThemeContextType | undefined>(undefined);

interface VisualThemeProviderProps {
  children: ReactNode;
  /** Context where theme is being used (admin-dashboard or resident-portal) */
  context: ThemeContext;
  /** Initial theme ID from database/settings */
  initialThemeId?: string;
}

/**
 * Visual Theme Provider
 *
 * Manages visual theme state and applies CSS variables to the document.
 * Works independently of light/dark mode (which is handled by next-themes).
 *
 * Usage:
 * ```tsx
 * <VisualThemeProvider context="admin-dashboard" initialThemeId={userTheme}>
 *   <App />
 * </VisualThemeProvider>
 * ```
 */
export function VisualThemeProvider({
  children,
  context,
  initialThemeId = 'nahid',
}: VisualThemeProviderProps) {
  const [themeId, setThemeIdState] = useState<string>(initialThemeId);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme(); // Get light/dark mode from next-themes

  // Subscribe to effective theme from React Query cache
  const { data: effectiveThemeFromCache } = useEffectiveTheme(context);

  // Mark as mounted to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync provider state when cache updates (e.g., after admin saves theme in settings)
  useEffect(() => {
    if (effectiveThemeFromCache && effectiveThemeFromCache !== themeId) {
      setThemeIdState(effectiveThemeFromCache);
    }
  }, [effectiveThemeFromCache, themeId]);

  // Get the current theme object
  const theme = useMemo(() => {
    const foundTheme = getThemeById(themeId);
    return foundTheme || getDefaultTheme();
  }, [themeId]);

  // Set theme ID with validation
  const setThemeId = useCallback((id: string) => {
    if (isValidThemeId(id)) {
      setThemeIdState(id);
    } else {
      console.warn(`Invalid theme ID: ${id}. Falling back to default.`);
      setThemeIdState('nahid');
    }
  }, []);

  // Apply CSS variables when theme or color mode changes
  useEffect(() => {
    if (!mounted) return;

    const isDark = resolvedTheme === 'dark';
    const colors = isDark ? theme.dark : theme.light;

    // Apply background colors
    document.documentElement.style.setProperty('--bg-primary', colors.bg.primary);
    document.documentElement.style.setProperty('--bg-secondary', colors.bg.secondary);
    document.documentElement.style.setProperty('--bg-card', colors.bg.card);
    document.documentElement.style.setProperty('--bg-sidebar', colors.bg.sidebar);

    // Apply text colors
    document.documentElement.style.setProperty('--text-primary', colors.text.primary);
    document.documentElement.style.setProperty('--text-secondary', colors.text.secondary);
    document.documentElement.style.setProperty('--text-muted', colors.text.muted);

    // Apply accent colors
    document.documentElement.style.setProperty('--bill-mint', colors.accent.primary);
    document.documentElement.style.setProperty('--bill-lavender', colors.accent.secondary);
    document.documentElement.style.setProperty('--bill-teal', colors.accent.tertiary);

    // Apply status colors
    document.documentElement.style.setProperty('--bill-success', colors.status.success);
    document.documentElement.style.setProperty('--bill-orange', colors.status.warning);
    document.documentElement.style.setProperty('--bill-coral', colors.status.error);

    // Apply typography
    document.documentElement.style.setProperty('--font-family-sans', theme.typography.fontFamily.sans);
    document.documentElement.style.setProperty('--font-family-mono', theme.typography.fontFamily.mono);

    // Apply border radius
    document.documentElement.style.setProperty('--radius', theme.borderRadius.lg);

    // Store current theme ID in session storage for persistence
    try {
      sessionStorage.setItem(`residio-visual-theme-${context}`, themeId);
    } catch {
      // SessionStorage not available
    }
  }, [theme, resolvedTheme, themeId, context, mounted]);

  const value = useMemo(
    () => ({
      theme,
      themeId,
      setThemeId,
      isLoading: !mounted,
    }),
    [theme, themeId, setThemeId, mounted]
  );

  return (
    <VisualThemeContext.Provider value={value}>
      {children}
    </VisualThemeContext.Provider>
  );
}

/**
 * Hook to access visual theme context
 */
export function useVisualTheme() {
  const context = useContext(VisualThemeContext);
  if (!context) {
    throw new Error('useVisualTheme must be used within VisualThemeProvider');
  }
  return context;
}
