import type { VisualTheme } from './types';

/**
 * Sunset Theme
 *
 * A warm, inviting theme with orange and coral gradients.
 * Features soft peach backgrounds with vibrant sunset-inspired accents.
 */
export const sunsetTheme: VisualTheme = {
  id: 'sunset',
  name: 'Sunset',
  description: 'Warm theme with orange and coral gradients',

  light: {
    bg: {
      primary: '#FFF9F5',      // Warm white with peach tint
      secondary: '#FFEDE0',    // Light peach
      card: '#FFFFFF',         // White cards
      sidebar: '#7C2D12',      // Burnt orange/sienna
      elevated: '#FFFFFF',
      hover: '#FFF1E6',
      active: '#FFE4D1',
    },
    text: {
      primary: '#1C1917',      // Warm black
      secondary: '#57534E',    // Warm gray
      muted: '#A8A29E',        // Stone
      disabled: '#D6D3D1',
      onAccent: '#FFFFFF',
    },
    accent: {
      primary: '#EA580C',      // Vibrant orange
      secondary: '#F97316',    // Bright orange
      tertiary: '#FB923C',     // Light orange
      hover: '#DC2626',
      active: '#C2410C',
    },
    status: {
      success: '#16A34A',      // Green
      successSubtle: '#DCFCE7',
      warning: '#D97706',      // Dark amber
      warningSubtle: '#FEF3C7',
      error: '#DC2626',        // Red
      errorSubtle: '#FEE2E2',
      info: '#0284C7',         // Sky blue
      infoSubtle: '#E0F2FE',
    },
    border: {
      default: '#FED7AA',      // Peach border
      subtle: '#FFF1E6',       // Very light peach
      focus: '#EA580C',
      hover: '#FDC998',
    },
    interactive: {
      default: '#FFF9F5',
      hover: '#FFEDE0',
      active: '#FFE4D1',
      disabled: '#FFF9F5',
      focus: '#EA580C',
    },
    input: {
      bg: '#FFFFFF',
      border: '#FDC998',
      borderHover: '#FDB886',
      borderFocus: '#EA580C',
      placeholder: '#A8A29E',
      bgDisabled: '#FFF9F5',
    },
    overlay: {
      backdrop: 'rgba(28, 25, 23, 0.5)',
      tooltip: '#7C2D12',
      popover: '#FFFFFF',
    },
  },

  dark: {
    bg: {
      primary: '#1C1210',      // Very dark brown
      secondary: '#2D1F1A',    // Dark brown
      card: '#2D1F1A',         // Brown cards
      sidebar: '#1C1210',      // Darkest brown
      elevated: '#2D1F1A',
      hover: '#3D2B24',
      active: '#4D3730',
    },
    text: {
      primary: '#FFF9F5',      // Warm white
      secondary: '#D6D3D1',    // Light stone
      muted: '#A8A29E',        // Stone
      disabled: '#78716C',
      onAccent: '#1C1210',
    },
    accent: {
      primary: '#F97316',      // Bright orange
      secondary: '#FB923C',    // Light orange
      tertiary: '#FDBA74',     // Pale orange
      hover: '#FBA565',
      active: '#FDB886',
    },
    status: {
      success: '#22C55E',
      successSubtle: '#14532D',
      warning: '#F59E0B',
      warningSubtle: '#78350F',
      error: '#EF4444',
      errorSubtle: '#7F1D1D',
      info: '#38BDF8',
      infoSubtle: '#0C4A6E',
    },
    border: {
      default: '#44322A',
      subtle: '#2D1F1A',
      focus: '#F97316',
      hover: '#5C4438',
    },
    interactive: {
      default: '#2D1F1A',
      hover: '#3D2B24',
      active: '#4D3730',
      disabled: '#2D1F1A',
      focus: '#F97316',
    },
    input: {
      bg: '#2D1F1A',
      border: '#5C4438',
      borderHover: '#78716C',
      borderFocus: '#F97316',
      placeholder: '#A8A29E',
      bgDisabled: '#2D1F1A',
    },
    overlay: {
      backdrop: 'rgba(28, 18, 16, 0.75)',
      tooltip: '#2D1F1A',
      popover: '#2D1F1A',
    },
  },

  typography: {
    fontFamily: {
      sans: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
      mono: 'var(--font-geist-mono), ui-monospace, monospace',
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
      '5xl': '3rem',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
    letterSpacing: {
      tight: '-0.02em',
      normal: '0',
      wide: '0.02em',
    },
  },

  spacing: {
    sidebarWidth: '280px',
    contentPadding: {
      mobile: '1.25rem',
      desktop: '2rem',
    },
    cardGap: '1.5rem',
    sectionMargin: '2rem',
  },

  borderRadius: {
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.25rem',
    full: '9999px',
  },

  shadows: {
    card: '0 2px 6px 0 rgb(234 88 12 / 0.06), 0 1px 3px -1px rgb(0 0 0 / 0.05)',
    elevated: '0 10px 20px -4px rgb(234 88 12 / 0.10), 0 6px 10px -6px rgb(0 0 0 / 0.06)',
    dropdown: '0 20px 32px -8px rgb(234 88 12 / 0.14), 0 10px 14px -8px rgb(0 0 0 / 0.08)',
  },

  chart: {
    colors: [
      '#EA580C', // Orange
      '#F97316', // Bright orange
      '#FB923C', // Light orange
      '#D97706', // Amber
      '#DC2626', // Red
    ],
    positive: '#16A34A',
    negative: '#DC2626',
  },
};
