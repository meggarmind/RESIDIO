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
  /** Preview theme ID (for hover preview, not persisted) */
  previewThemeId: string | null;
  /** Set preview theme (for hover preview, not persisted) */
  setPreviewThemeId: (id: string | null) => void;
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
  initialThemeId = 'default',
}: VisualThemeProviderProps) {
  // Migrate legacy theme IDs ('nahid', 'paier') to 'default'
  const migratedThemeId = useMemo(() => {
    if (initialThemeId === 'nahid' || initialThemeId === 'paier') {
      return 'default';
    }
    return initialThemeId;
  }, [initialThemeId]);

  const [themeId, setThemeIdState] = useState<string>(migratedThemeId);
  const [previewThemeId, setPreviewThemeIdState] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme(); // Get light/dark mode from next-themes

  // Subscribe to effective theme from React Query cache
  const { data: effectiveThemeFromCache } = useEffectiveTheme(context);

  // Mark as mounted and migrate legacy session storage
  useEffect(() => {
    setMounted(true);

    // Migrate legacy theme IDs from session storage
    try {
      const storageKey = `residio-visual-theme-${context}`;
      const storedTheme = sessionStorage.getItem(storageKey);

      if (storedTheme === 'nahid' || storedTheme === 'paier') {
        sessionStorage.setItem(storageKey, 'default');
        setThemeIdState('default');
      }
    } catch {
      // SessionStorage not available
    }
  }, [context]);

  // Sync provider state when cache updates (e.g., after admin saves theme in settings)
  useEffect(() => {
    if (effectiveThemeFromCache && effectiveThemeFromCache !== themeId) {
      setThemeIdState(effectiveThemeFromCache);
    }
  }, [effectiveThemeFromCache, themeId]);

  // Get the current theme object (use preview if set, otherwise selected)
  const activeThemeId = previewThemeId || themeId;
  const theme = useMemo(() => {
    const foundTheme = getThemeById(activeThemeId);
    return foundTheme || getDefaultTheme();
  }, [activeThemeId]);

  // Set theme ID with validation
  const setThemeId = useCallback((id: string) => {
    // Migrate legacy theme IDs before validation
    const migratedId = (id === 'nahid' || id === 'paier') ? 'default' : id;

    if (isValidThemeId(migratedId)) {
      setThemeIdState(migratedId);
      // Clear preview when a theme is selected
      setPreviewThemeIdState(null);
    } else {
      console.warn(`Invalid theme ID: ${id}. Falling back to default.`);
      setThemeIdState('default');
    }
  }, []);

  // Set preview theme ID (for hover preview without persisting)
  const setPreviewThemeId = useCallback((id: string | null) => {
    if (id === null || isValidThemeId(id)) {
      setPreviewThemeIdState(id);
    }
  }, []);

  // Apply CSS variables when theme or color mode changes
  useEffect(() => {
    if (!mounted) return;

    const isDark = resolvedTheme === 'dark';
    const colors = isDark ? theme.dark : theme.light;

    // === Background colors ===
    document.documentElement.style.setProperty('--bg-primary', colors.bg.primary);
    document.documentElement.style.setProperty('--bg-secondary', colors.bg.secondary);
    document.documentElement.style.setProperty('--bg-card', colors.bg.card);
    document.documentElement.style.setProperty('--bg-sidebar', colors.bg.sidebar);
    document.documentElement.style.setProperty('--bg-elevated', colors.bg.elevated);
    document.documentElement.style.setProperty('--bg-hover', colors.bg.hover);
    document.documentElement.style.setProperty('--bg-active', colors.bg.active);

    // === Text colors ===
    document.documentElement.style.setProperty('--text-primary', colors.text.primary);
    document.documentElement.style.setProperty('--text-secondary', colors.text.secondary);
    document.documentElement.style.setProperty('--text-muted', colors.text.muted);
    document.documentElement.style.setProperty('--text-disabled', colors.text.disabled);
    document.documentElement.style.setProperty('--text-on-accent', colors.text.onAccent);

    // === Accent colors ===
    document.documentElement.style.setProperty('--accent-primary', colors.accent.primary);
    document.documentElement.style.setProperty('--accent-secondary', colors.accent.secondary);
    document.documentElement.style.setProperty('--accent-tertiary', colors.accent.tertiary);
    document.documentElement.style.setProperty('--accent-hover', colors.accent.hover);
    document.documentElement.style.setProperty('--accent-active', colors.accent.active);

    // Legacy accent names (for backwards compatibility)
    document.documentElement.style.setProperty('--bill-mint', colors.accent.primary);
    document.documentElement.style.setProperty('--bill-lavender', colors.accent.secondary);
    document.documentElement.style.setProperty('--bill-teal', colors.accent.tertiary);

    // === Status colors ===
    document.documentElement.style.setProperty('--status-success', colors.status.success);
    document.documentElement.style.setProperty('--status-success-subtle', colors.status.successSubtle);
    document.documentElement.style.setProperty('--status-warning', colors.status.warning);
    document.documentElement.style.setProperty('--status-warning-subtle', colors.status.warningSubtle);
    document.documentElement.style.setProperty('--status-error', colors.status.error);
    document.documentElement.style.setProperty('--status-error-subtle', colors.status.errorSubtle);
    document.documentElement.style.setProperty('--status-info', colors.status.info);
    document.documentElement.style.setProperty('--status-info-subtle', colors.status.infoSubtle);

    // Legacy status names (for backwards compatibility)
    document.documentElement.style.setProperty('--bill-success', colors.status.success);
    document.documentElement.style.setProperty('--bill-orange', colors.status.warning);
    document.documentElement.style.setProperty('--bill-coral', colors.status.error);

    // === Border colors ===
    document.documentElement.style.setProperty('--border-default', colors.border.default);
    document.documentElement.style.setProperty('--border-subtle', colors.border.subtle);
    document.documentElement.style.setProperty('--border-focus', colors.border.focus);
    document.documentElement.style.setProperty('--border-hover', colors.border.hover);

    // === Interactive states ===
    document.documentElement.style.setProperty('--interactive-default', colors.interactive.default);
    document.documentElement.style.setProperty('--interactive-hover', colors.interactive.hover);
    document.documentElement.style.setProperty('--interactive-active', colors.interactive.active);
    document.documentElement.style.setProperty('--interactive-disabled', colors.interactive.disabled);
    document.documentElement.style.setProperty('--interactive-focus', colors.interactive.focus);

    // === Input states ===
    document.documentElement.style.setProperty('--input-bg', colors.input.bg);
    document.documentElement.style.setProperty('--input-border', colors.input.border);
    document.documentElement.style.setProperty('--input-border-hover', colors.input.borderHover);
    document.documentElement.style.setProperty('--input-border-focus', colors.input.borderFocus);
    document.documentElement.style.setProperty('--input-placeholder', colors.input.placeholder);
    document.documentElement.style.setProperty('--input-bg-disabled', colors.input.bgDisabled);

    // === Overlay colors ===
    document.documentElement.style.setProperty('--overlay-backdrop', colors.overlay.backdrop);
    document.documentElement.style.setProperty('--overlay-tooltip', colors.overlay.tooltip);
    document.documentElement.style.setProperty('--overlay-popover', colors.overlay.popover);

    // === Typography ===
    document.documentElement.style.setProperty('--font-family-sans', theme.typography.fontFamily.sans);
    document.documentElement.style.setProperty('--font-family-mono', theme.typography.fontFamily.mono);

    // === Border radius ===
    document.documentElement.style.setProperty('--radius', theme.borderRadius.lg);
    document.documentElement.style.setProperty('--radius-sm', theme.borderRadius.sm);
    document.documentElement.style.setProperty('--radius-md', theme.borderRadius.md);
    document.documentElement.style.setProperty('--radius-xl', theme.borderRadius.xl);

    // === Shadows ===
    document.documentElement.style.setProperty('--shadow-card', theme.shadows.card);
    document.documentElement.style.setProperty('--shadow-elevated', theme.shadows.elevated);
    document.documentElement.style.setProperty('--shadow-dropdown', theme.shadows.dropdown);

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
      previewThemeId,
      setPreviewThemeId,
    }),
    [theme, themeId, setThemeId, mounted, previewThemeId, setPreviewThemeId]
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
