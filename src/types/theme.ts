/**
 * tweakcn.com Theme Type Definitions
 *
 * This file defines TypeScript interfaces for shadcn/ui themes from tweakcn.com.
 * These themes use OKLCH color space for precise color management across light/dark modes.
 */

export interface TweakcnTheme {
  /** Unique theme identifier (e.g., 'supabase', 'doom-64') */
  id: string;

  /** Human-readable theme name */
  name: string;

  /** Optional theme description */
  description?: string;

  /** Category for UI organization */
  category: 'light' | 'dark' | 'auto';

  /** CSS variables for light and dark modes */
  cssVars: {
    /** Shared theme properties (fonts, radius, tracking) */
    theme: TweakcnThemeVars;

    /** Light mode color palette */
    light: TweakcnColorVars;

    /** Dark mode color palette */
    dark: TweakcnColorVars;
  };

  /** Legacy compatibility: Typography settings (for backward compatibility) */
  typography?: {
    fontFamily: {
      sans: string;
      mono: string;
      serif?: string;
    };
  };

  /** Legacy compatibility: Border radius settings (for backward compatibility) */
  borderRadius?: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };

  /** Legacy compatibility: Shadow settings (for backward compatibility) */
  shadows?: {
    card: string;
    elevated: string;
    dropdown: string;
  };
}

/** Shared theme variables (typography, spacing, etc.) */
export interface TweakcnThemeVars {
  /** Sans-serif font family */
  'font-sans': string;

  /** Monospace font family */
  'font-mono': string;

  /** Serif font family */
  'font-serif': string;

  /** Border radius base value */
  radius: string;

  /** Letter spacing variants */
  'tracking-tighter': string;
  'tracking-tight': string;
  'tracking-wide': string;
  'tracking-wider': string;
  'tracking-widest': string;
}

/** Color variables for a single mode (light or dark) */
export interface TweakcnColorVars {
  // === Semantic Colors (shadcn/ui standard) ===

  /** Primary page background */
  background: string;

  /** Text color on background */
  foreground: string;

  /** Card/surface background */
  card: string;

  /** Text color on card */
  'card-foreground': string;

  /** Popover/modal background */
  popover: string;

  /** Text color on popover */
  'popover-foreground': string;

  /** Primary action color (buttons, links) */
  primary: string;

  /** Text color on primary */
  'primary-foreground': string;

  /** Secondary action color */
  secondary: string;

  /** Text color on secondary */
  'secondary-foreground': string;

  /** Muted background color */
  muted: string;

  /** Muted text color */
  'muted-foreground': string;

  /** Accent/highlight color */
  accent: string;

  /** Text color on accent */
  'accent-foreground': string;

  /** Destructive action color (delete, error) */
  destructive: string;

  /** Text color on destructive */
  'destructive-foreground': string;

  /** Success color (green) */
  success: string;

  /** Text color on success */
  'success-foreground': string;

  /** Warning color (amber/orange) */
  warning: string;

  /** Text color on warning */
  'warning-foreground': string;

  /** Info color (blue) */
  info: string;

  /** Text color on info */
  'info-foreground': string;

  /** Border color */
  border: string;

  /** Input field background */
  input: string;

  /** Focus ring color */
  ring: string;

  // === Data Visualization ===

  /** Chart color 1 */
  'chart-1': string;

  /** Chart color 2 */
  'chart-2': string;

  /** Chart color 3 */
  'chart-3': string;

  /** Chart color 4 */
  'chart-4': string;

  /** Chart color 5 */
  'chart-5': string;

  // === Sidebar Extensions (if present) ===

  /** Sidebar background */
  sidebar?: string;

  /** Sidebar text color */
  'sidebar-foreground'?: string;

  /** Sidebar primary accent */
  'sidebar-primary'?: string;

  /** Sidebar primary foreground */
  'sidebar-primary-foreground'?: string;

  /** Sidebar accent */
  'sidebar-accent'?: string;

  /** Sidebar accent foreground */
  'sidebar-accent-foreground'?: string;

  /** Sidebar border */
  'sidebar-border'?: string;

  /** Sidebar ring */
  'sidebar-ring'?: string;

  // === Typography (duplicated from theme for mode-specific overrides) ===

  'font-sans'?: string;
  'font-serif'?: string;
  'font-mono'?: string;

  // === Shadows ===

  'shadow-color'?: string;
  'shadow-opacity'?: string;
  'shadow-blur'?: string;
  'shadow-spread'?: string;
  'shadow-offset-x'?: string;
  'shadow-offset-y'?: string;
  'shadow-2xs'?: string;
  'shadow-xs'?: string;
  'shadow-sm'?: string;
  shadow?: string;
  'shadow-md'?: string;
  'shadow-lg'?: string;
  'shadow-xl'?: string;
  'shadow-2xl'?: string;

  // === Spacing ===

  'letter-spacing'?: string;
  spacing?: string;
  'tracking-normal'?: string;

  // === Border Radius (mode-specific override) ===

  radius?: string;
}

/** Helper type for theme registry */
export type ThemeRegistry = Record<string, TweakcnTheme>;
