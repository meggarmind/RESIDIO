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
import type { TweakcnTheme } from '@/types/theme';
import { getDefaultTheme, getThemeById, isValidThemeId } from '@/lib/themes/tweakcn-registry';
import { loadThemeFonts } from '@/lib/fonts';
import { useEffectiveTheme } from '@/hooks/use-theme-preferences';

type ThemeContext = 'admin-dashboard' | 'resident-portal';

interface VisualThemeContextType {
  /** Current visual theme */
  theme: TweakcnTheme;
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
  /**
   * Initial theme ID from database/settings (optional)
   * If not provided, will load from session storage or default to 'supabase'
   */
  initialThemeId?: string;
}

/**
 * Visual Theme Provider (tweakcn.com Integration)
 *
 * Manages visual theme state and applies CSS variables to the document.
 * Works independently of light/dark mode (which is handled by next-themes).
 *
 * This version uses tweakcn.com theme presets with OKLCH color space.
 *
 * Usage:
 * ```tsx
 * <VisualThemeProvider context="resident-portal" initialThemeId={userTheme}>
 *   <App />
 * </VisualThemeProvider>
 * ```
 */
export function VisualThemeProvider({
  children,
  context,
  initialThemeId,
}: VisualThemeProviderProps) {
  // Migrate legacy theme IDs to 'supabase' (new default)
  const migratedThemeId = useMemo(() => {
    if (!initialThemeId) return 'supabase';

    // Legacy theme IDs to migrate (old custom themes no longer available)
    const legacyThemes = [
      'nahid', 'paier', 'default', 'modern', 'elegant-luxury-old',
      'midnight-bloom', 'sunset', 'portal-modern', 'supabase-old'
    ];

    if (legacyThemes.includes(initialThemeId)) {
      return 'supabase';
    }

    // Validate theme exists in new tweakcn registry
    if (!isValidThemeId(initialThemeId)) {
      return 'supabase';
    }

    return initialThemeId;
  }, [initialThemeId]);

  // Initialize theme state from session storage or provided initial value
  const [themeId, setThemeIdState] = useState<string>(() => {
    // Try to load from session storage first (for instant render without flash)
    try {
      const storageKey = `residio-visual-theme-${context}`;
      const stored = sessionStorage.getItem(storageKey);
      if (stored && isValidThemeId(stored)) {
        return stored;
      }
    } catch {
      // SessionStorage not available (SSR or private browsing)
    }

    // Fall back to provided initial theme or default (supabase)
    return migratedThemeId;
  });
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

      if (storedTheme && !isValidThemeId(storedTheme)) {
        sessionStorage.setItem(storageKey, 'supabase');
        setThemeIdState('supabase');
      }
    } catch {
      // SessionStorage not available
    }
  }, [context]);

  // Sync provider state when cache updates (e.g., after user changes theme in settings)
  useEffect(() => {
    if (effectiveThemeFromCache && effectiveThemeFromCache !== themeId) {
      console.log('[VisualThemeProvider] Syncing theme from cache:', effectiveThemeFromCache);
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
    if (isValidThemeId(id)) {
      setThemeIdState(id);
      // Clear preview when a theme is selected
      setPreviewThemeIdState(null);
    } else {
      console.warn(`[VisualThemeProvider] Invalid theme ID: ${id}. Falling back to supabase.`);
      setThemeIdState('supabase');
    }
  }, []);

  // Set preview theme ID (for hover preview without persisting)
  const setPreviewThemeId = useCallback((id: string | null) => {
    if (id === null || isValidThemeId(id)) {
      setPreviewThemeIdState(id);
    }
  }, []);

  // Load fonts dynamically when theme changes
  useEffect(() => {
    if (!mounted) return;

    const { 'font-sans': fontSans, 'font-mono': fontMono, 'font-serif': fontSerif } = theme.cssVars.theme;

    loadThemeFonts(fontSans, fontMono, fontSerif).catch((err) => {
      console.error('[VisualThemeProvider] Font loading failed:', err);
    });
  }, [theme, mounted]);

  // Apply CSS variables when theme or color mode changes
  useEffect(() => {
    if (!mounted) return;

    console.log('[VisualThemeProvider] Applying theme:', themeId, 'for context:', context);
    const isDark = resolvedTheme === 'dark';
    const colors = isDark ? theme.cssVars.dark : theme.cssVars.light;
    const themeVars = theme.cssVars.theme;

    // ============================================================================
    // TWEAKCN SEMANTIC COLORS (OKLCH format - use directly, no wrapper!)
    // ============================================================================

    // Core colors
    document.documentElement.style.setProperty('--background', colors.background);
    document.documentElement.style.setProperty('--foreground', colors.foreground);

    // Card
    document.documentElement.style.setProperty('--card', colors.card);
    document.documentElement.style.setProperty('--card-foreground', colors['card-foreground']);

    // Popover
    document.documentElement.style.setProperty('--popover', colors.popover);
    document.documentElement.style.setProperty('--popover-foreground', colors['popover-foreground']);

    // Primary
    document.documentElement.style.setProperty('--primary', colors.primary);
    document.documentElement.style.setProperty('--primary-foreground', colors['primary-foreground']);

    // Secondary
    document.documentElement.style.setProperty('--secondary', colors.secondary);
    document.documentElement.style.setProperty('--secondary-foreground', colors['secondary-foreground']);

    // Muted
    document.documentElement.style.setProperty('--muted', colors.muted);
    document.documentElement.style.setProperty('--muted-foreground', colors['muted-foreground']);

    // Accent
    document.documentElement.style.setProperty('--accent', colors.accent);
    document.documentElement.style.setProperty('--accent-foreground', colors['accent-foreground']);

    // Destructive
    document.documentElement.style.setProperty('--destructive', colors.destructive);
    document.documentElement.style.setProperty('--destructive-foreground', colors['destructive-foreground']);

    // Status
    if (colors.success) document.documentElement.style.setProperty('--success', colors.success);
    if (colors['success-foreground']) document.documentElement.style.setProperty('--success-foreground', colors['success-foreground']);
    if (colors.warning) document.documentElement.style.setProperty('--warning', colors.warning);
    if (colors['warning-foreground']) document.documentElement.style.setProperty('--warning-foreground', colors['warning-foreground']);
    if (colors.info) document.documentElement.style.setProperty('--info', colors.info);
    if (colors['info-foreground']) document.documentElement.style.setProperty('--info-foreground', colors['info-foreground']);

    // Border & Input
    document.documentElement.style.setProperty('--border', colors.border);
    document.documentElement.style.setProperty('--input', colors.input);
    document.documentElement.style.setProperty('--ring', colors.ring);

    // Chart colors
    document.documentElement.style.setProperty('--chart-1', colors['chart-1']);
    document.documentElement.style.setProperty('--chart-2', colors['chart-2']);
    document.documentElement.style.setProperty('--chart-3', colors['chart-3']);
    document.documentElement.style.setProperty('--chart-4', colors['chart-4']);
    document.documentElement.style.setProperty('--chart-5', colors['chart-5']);

    // Sidebar (optional tweakcn extension)
    if (colors.sidebar) {
      document.documentElement.style.setProperty('--sidebar', colors.sidebar);
    }
    if (colors['sidebar-foreground']) {
      document.documentElement.style.setProperty('--sidebar-foreground', colors['sidebar-foreground']);
    }
    if (colors['sidebar-primary']) {
      document.documentElement.style.setProperty('--sidebar-primary', colors['sidebar-primary']);
    }
    if (colors['sidebar-primary-foreground']) {
      document.documentElement.style.setProperty('--sidebar-primary-foreground', colors['sidebar-primary-foreground']);
    }
    if (colors['sidebar-accent']) {
      document.documentElement.style.setProperty('--sidebar-accent', colors['sidebar-accent']);
    }
    if (colors['sidebar-accent-foreground']) {
      document.documentElement.style.setProperty('--sidebar-accent-foreground', colors['sidebar-accent-foreground']);
    }
    if (colors['sidebar-border']) {
      document.documentElement.style.setProperty('--sidebar-border', colors['sidebar-border']);
    }
    if (colors['sidebar-ring']) {
      document.documentElement.style.setProperty('--sidebar-ring', colors['sidebar-ring']);
    }

    // ============================================================================
    // LEGACY VARIABLE MAPPING (for backward compatibility)
    // ============================================================================

    // Background colors
    document.documentElement.style.setProperty('--bg-primary', colors.background);
    document.documentElement.style.setProperty('--bg-secondary', colors.muted);
    document.documentElement.style.setProperty('--bg-card', colors.card);
    document.documentElement.style.setProperty('--bg-sidebar', colors.sidebar || colors.card);
    document.documentElement.style.setProperty('--bg-elevated', colors.popover);
    document.documentElement.style.setProperty('--bg-hover', colors.accent);
    document.documentElement.style.setProperty('--bg-active', colors.primary);

    // Text colors
    document.documentElement.style.setProperty('--text-primary', colors.foreground);
    document.documentElement.style.setProperty('--text-secondary', colors['muted-foreground']);
    document.documentElement.style.setProperty('--text-muted', colors['muted-foreground']);
    document.documentElement.style.setProperty('--text-disabled', colors['muted-foreground']);
    document.documentElement.style.setProperty('--text-on-accent', colors['primary-foreground']);

    // Accent colors
    document.documentElement.style.setProperty('--accent-primary', colors.primary);
    document.documentElement.style.setProperty('--accent-secondary', colors.secondary);
    document.documentElement.style.setProperty('--accent-tertiary', colors.accent);
    document.documentElement.style.setProperty('--accent-hover', colors.primary);
    document.documentElement.style.setProperty('--accent-active', colors.primary);

    // Legacy accent names
    document.documentElement.style.setProperty('--bill-mint', colors.primary);
    document.documentElement.style.setProperty('--bill-lavender', colors.secondary);
    document.documentElement.style.setProperty('--bill-teal', colors.accent);

    // Status colors (modern & legacy mappings)
    document.documentElement.style.setProperty('--success', colors['chart-3']);
    document.documentElement.style.setProperty('--success-foreground', colors['primary-foreground']);
    document.documentElement.style.setProperty('--warning', colors['chart-4']);
    document.documentElement.style.setProperty('--warning-foreground', colors['primary-foreground']);
    document.documentElement.style.setProperty('--info', colors['chart-2']);
    document.documentElement.style.setProperty('--info-foreground', colors['primary-foreground']);

    document.documentElement.style.setProperty('--status-success', colors['chart-3']);
    document.documentElement.style.setProperty('--status-success-subtle', colors['chart-3']);
    document.documentElement.style.setProperty('--status-warning', colors['chart-4']);
    document.documentElement.style.setProperty('--status-warning-subtle', colors['chart-4']);
    document.documentElement.style.setProperty('--status-error', colors.destructive);
    document.documentElement.style.setProperty('--status-error-subtle', colors.destructive);
    document.documentElement.style.setProperty('--status-info', colors['chart-2']);
    document.documentElement.style.setProperty('--status-info-subtle', colors['chart-2']);

    // Legacy status names
    document.documentElement.style.setProperty('--bill-success', colors['chart-3']);
    document.documentElement.style.setProperty('--bill-orange', colors['chart-4']);
    document.documentElement.style.setProperty('--bill-coral', colors.destructive);

    // Border colors
    document.documentElement.style.setProperty('--border-default', colors.border);
    document.documentElement.style.setProperty('--border-subtle', colors.border);
    document.documentElement.style.setProperty('--border-focus', colors.ring);
    document.documentElement.style.setProperty('--border-hover', colors.border);

    // Interactive states
    document.documentElement.style.setProperty('--interactive-default', colors.primary);
    document.documentElement.style.setProperty('--interactive-hover', colors.primary);
    document.documentElement.style.setProperty('--interactive-active', colors.primary);
    document.documentElement.style.setProperty('--interactive-disabled', colors['muted-foreground']);
    document.documentElement.style.setProperty('--interactive-focus', colors.ring);

    // Input states
    document.documentElement.style.setProperty('--input-bg', colors.background);
    document.documentElement.style.setProperty('--input-border', colors.input);
    document.documentElement.style.setProperty('--input-border-hover', colors.ring);
    document.documentElement.style.setProperty('--input-border-focus', colors.ring);
    document.documentElement.style.setProperty('--input-placeholder', colors['muted-foreground']);
    document.documentElement.style.setProperty('--input-bg-disabled', colors.muted);

    // Overlay colors
    document.documentElement.style.setProperty('--overlay-backdrop', 'rgba(0, 0, 0, 0.5)');
    document.documentElement.style.setProperty('--overlay-tooltip', colors.popover);
    document.documentElement.style.setProperty('--overlay-popover', colors.popover);

    // === Typography ===
    document.documentElement.style.setProperty('--font-family-sans', theme.typography?.fontFamily.sans || themeVars['font-sans']);
    document.documentElement.style.setProperty('--font-family-mono', theme.typography?.fontFamily.mono || themeVars['font-mono']);
    if (theme.typography?.fontFamily.serif || themeVars['font-serif']) {
      document.documentElement.style.setProperty('--font-family-serif', theme.typography?.fontFamily.serif || themeVars['font-serif']);
    }

    // === Letter Spacing ===
    document.documentElement.style.setProperty('--tracking-tighter', themeVars['tracking-tighter'] || '-0.05em');
    document.documentElement.style.setProperty('--tracking-tight', themeVars['tracking-tight'] || '-0.025em');
    document.documentElement.style.setProperty('--tracking-normal', '0');
    document.documentElement.style.setProperty('--tracking-wide', themeVars['tracking-wide'] || '0.025em');
    document.documentElement.style.setProperty('--tracking-wider', themeVars['tracking-wider'] || '0.05em');
    document.documentElement.style.setProperty('--tracking-widest', themeVars['tracking-widest'] || '0.1em');

    // === Border radius ===
    document.documentElement.style.setProperty('--radius', themeVars.radius);

    // === Shadows ===
    if (theme.shadows) {
      document.documentElement.style.setProperty('--shadow-card', theme.shadows.card);
      document.documentElement.style.setProperty('--shadow-elevated', theme.shadows.elevated);
      document.documentElement.style.setProperty('--shadow-dropdown', theme.shadows.dropdown);
    } else {
      // Generate shadows from border color if not provided
      const shadowColor = colors.border;
      document.documentElement.style.setProperty('--shadow-card', `0 1px 3px 0 ${shadowColor}`);
      document.documentElement.style.setProperty('--shadow-elevated', `0 4px 6px -1px ${shadowColor}`);
      document.documentElement.style.setProperty('--shadow-dropdown', `0 10px 15px -3px ${shadowColor}`);
    }

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
