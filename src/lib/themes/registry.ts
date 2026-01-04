import type { VisualTheme } from './types';
import { nahidTheme } from './nahid';
import { paierTheme } from './paier';

/**
 * Theme Registry
 *
 * Central registry of all available visual themes.
 * Add new theme imports here as they are created.
 */

export const THEME_REGISTRY: Record<string, VisualTheme> = {
  nahid: nahidTheme,
  paier: paierTheme,
};

/**
 * Get all available themes
 */
export function getAvailableThemes(): VisualTheme[] {
  return Object.values(THEME_REGISTRY);
}

/**
 * Get a theme by ID
 */
export function getThemeById(id: string): VisualTheme | undefined {
  return THEME_REGISTRY[id];
}

/**
 * Get the default theme (Nahid)
 */
export function getDefaultTheme(): VisualTheme {
  return nahidTheme;
}

/**
 * Check if a theme ID exists
 */
export function isValidThemeId(id: string): boolean {
  return id in THEME_REGISTRY;
}
