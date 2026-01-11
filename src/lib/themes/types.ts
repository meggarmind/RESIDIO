/**
 * Visual Theme System Type Definitions
 *
 * Defines the structure for visual themes (color palettes, typography, spacing).
 * This is separate from light/dark mode (brightness) and layout themes (spacing/density).
 */

export interface ThemeColors {
  /** Background colors for different surfaces */
  bg: {
    /** Primary page background */
    primary: string;
    /** Secondary background for sections */
    secondary: string;
    /** Card background */
    card: string;
    /** Sidebar background */
    sidebar: string;
    /** Elevated surface (modals, dropdowns) */
    elevated: string;
    /** Hover state background */
    hover: string;
    /** Active/pressed state background */
    active: string;
  };

  /** Text colors for content hierarchy */
  text: {
    /** Primary text for headings and important content */
    primary: string;
    /** Secondary text for body content */
    secondary: string;
    /** Muted text for captions and less important content */
    muted: string;
    /** Disabled text */
    disabled: string;
    /** Text on colored backgrounds (ensures contrast) */
    onAccent: string;
  };

  /** Accent colors for highlights and interactive elements */
  accent: {
    /** Primary accent color for main interactive elements */
    primary: string;
    /** Secondary accent for complementary actions */
    secondary: string;
    /** Tertiary accent for subtle highlights */
    tertiary: string;
    /** Hover state for accent elements */
    hover: string;
    /** Active/pressed state for accent elements */
    active: string;
  };

  /** Status and semantic colors */
  status: {
    success: string;
    successSubtle: string;
    warning: string;
    warningSubtle: string;
    error: string;
    errorSubtle: string;
    info: string;
    infoSubtle: string;
  };

  /** Border and divider colors */
  border: {
    /** Default border color */
    default: string;
    /** Subtle border for low-emphasis divisions */
    subtle: string;
    /** Focus ring color for accessibility */
    focus: string;
    /** Hover state border */
    hover: string;
  };

  /** Interactive element states */
  interactive: {
    /** Default button/link background */
    default: string;
    /** Hover state */
    hover: string;
    /** Active/pressed state */
    active: string;
    /** Disabled state */
    disabled: string;
    /** Focus ring */
    focus: string;
  };

  /** Input field states */
  input: {
    /** Default input background */
    bg: string;
    /** Input border */
    border: string;
    /** Input border on hover */
    borderHover: string;
    /** Input border on focus */
    borderFocus: string;
    /** Placeholder text */
    placeholder: string;
    /** Disabled input background */
    bgDisabled: string;
  };

  /** Overlay colors */
  overlay: {
    /** Modal backdrop */
    backdrop: string;
    /** Tooltip background */
    tooltip: string;
    /** Popover background */
    popover: string;
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
 * Theme category for organization
 */
export type ThemeCategory = 'core' | 'dark' | 'light';

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

  /** Theme category for grouping in selectors */
  category?: ThemeCategory;

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
