/**
 * Visual Theme System Type Definitions
 *
 * Defines the structure for visual themes (color palettes, typography, spacing).
 * This is separate from light/dark mode (brightness) and layout themes (spacing/density).
 */

export interface ThemeColors {
  /** Primary background color */
  bg: {
    primary: string;
    secondary: string;
    card: string;
    sidebar: string;
  };

  /** Text colors */
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };

  /** Accent colors for highlights and interactive elements */
  accent: {
    primary: string;
    secondary: string;
    tertiary: string;
  };

  /** Status colors */
  status: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };

  /** Border and divider colors */
  border: {
    default: string;
    subtle: string;
  };
}

export interface ThemeTypography {
  /** Font family for body text */
  fontFamily: {
    sans: string;
    mono: string;
  };

  /** Font sizes */
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    '4xl': string;
    '5xl': string;
  };

  /** Font weights */
  fontWeight: {
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
  };

  /** Line heights */
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };

  /** Letter spacing */
  letterSpacing: {
    tight: string;
    normal: string;
    wide: string;
  };
}

export interface ThemeSpacing {
  /** Sidebar width */
  sidebarWidth: string;

  /** Content padding */
  contentPadding: {
    mobile: string;
    desktop: string;
  };

  /** Card gaps */
  cardGap: string;

  /** Section margins */
  sectionMargin: string;
}

export interface ThemeBorderRadius {
  /** Border radius values for different component types */
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

export interface ThemeShadows {
  /** Shadow definitions for elevation */
  card: string;
  elevated: string;
  dropdown: string;
}

export interface ThemeChart {
  /** Colors for data visualization */
  colors: string[];
  positive: string;
  negative: string;
}

/**
 * Complete visual theme definition
 */
export interface VisualTheme {
  /** Unique identifier for the theme */
  id: string;

  /** Display name */
  name: string;

  /** Description of the theme */
  description: string;

  /** Light mode colors */
  light: ThemeColors;

  /** Dark mode colors */
  dark: ThemeColors;

  /** Typography settings (consistent across light/dark) */
  typography: ThemeTypography;

  /** Spacing settings */
  spacing: ThemeSpacing;

  /** Border radius settings */
  borderRadius: ThemeBorderRadius;

  /** Shadow settings */
  shadows: ThemeShadows;

  /** Chart colors */
  chart: ThemeChart;
}

/**
 * Theme preference stored in database
 */
export interface ThemePreference {
  /** Theme ID */
  themeId: string;

  /** Light or dark mode (independent of visual theme) */
  colorMode: 'light' | 'dark' | 'system';
}

/**
 * Available theme contexts
 */
export type ThemeContext = 'admin-dashboard' | 'resident-portal';
