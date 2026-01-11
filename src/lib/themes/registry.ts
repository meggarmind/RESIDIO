import type { VisualTheme, ThemeCategory } from './types';
import { defaultTheme } from './default';
import { modernTheme } from './modern';
import { elegantLuxuryTheme } from './elegant-luxury';
import { midnightBloomTheme } from './midnight-bloom';
import { sunsetTheme } from './sunset';
import { supabaseTheme } from './supabase';
import { tweakcnThemes } from './tweakcn-themes';
import { portalModernTheme } from './portal-modern';

/**
 * Theme Registry
 *
 * Central registry of all available visual themes.
 * Includes core themes and the extended tweakcn theme library.
 *
 * Themes are organized into categories:
 * - core: Default and Modern (always available)
 * - dark: Dark-optimized themes
 * - light: Light-optimized themes
 */

// Core themes (with category assignment)
const coreThemes: VisualTheme[] = [
  { ...defaultTheme, category: 'core' as ThemeCategory },
  { ...modernTheme, category: 'core' as ThemeCategory },
  { ...portalModernTheme, category: 'core' as ThemeCategory },
];

// Custom themes from Tier 3.1 (with category assignment)
const customThemes: VisualTheme[] = [
  { ...elegantLuxuryTheme, category: 'light' as ThemeCategory },
  { ...midnightBloomTheme, category: 'dark' as ThemeCategory },
  { ...sunsetTheme, category: 'light' as ThemeCategory },
  { ...supabaseTheme, category: 'dark' as ThemeCategory },
];

// Build the registry from all theme sources
const allThemes = [...coreThemes, ...customThemes, ...tweakcnThemes];

export const THEME_REGISTRY: Record<string, VisualTheme> = allThemes.reduce(
  (acc, theme) => {
    acc[theme.id] = theme;
    return acc;
  },
  {} as Record<string, VisualTheme>
);

/**
 * Get all available themes
 */
export function getAvailableThemes(): VisualTheme[] {
  return Object.values(THEME_REGISTRY);
}

/**
 * Get themes by category
 */
export function getThemesByCategory(category: ThemeCategory): VisualTheme[] {
  return getAvailableThemes().filter(theme => theme.category === category);
}

/**
 * Get themes grouped by category
 */
export function getThemesGroupedByCategory(): Record<ThemeCategory, VisualTheme[]> {
  const themes = getAvailableThemes();
  return {
    core: themes.filter(t => t.category === 'core'),
    dark: themes.filter(t => t.category === 'dark'),
    light: themes.filter(t => t.category === 'light'),
  };
}

/**
 * Get a theme by ID
 */
export function getThemeById(id: string): VisualTheme | undefined {
  return THEME_REGISTRY[id];
}

/**
 * Get the default theme
 */
export function getDefaultTheme(): VisualTheme {
  return THEME_REGISTRY.default || defaultTheme;
}

/**
 * Check if a theme ID exists
 */
export function isValidThemeId(id: string): boolean {
  return id in THEME_REGISTRY;
}

/**
 * Get total theme count
 */
export function getThemeCount(): number {
  return Object.keys(THEME_REGISTRY).length;
}
