import type { VisualTheme } from './types';

/**
 * Midnight Bloom Theme
 *
 * A dramatic dark theme with purple and pink floral accents.
 * Features deep midnight backgrounds with vibrant magenta and violet highlights.
 */
export const midnightBloomTheme: VisualTheme = {
  id: 'midnightbloom',
  name: 'Midnight Bloom',
  description: 'Dramatic dark theme with purple and pink floral accents',

  light: {
    bg: {
      primary: '#F8F5FA',      // Lavender tint
      secondary: '#EDE5F3',    // Light purple
      card: '#FFFFFF',         // White cards
      sidebar: '#2D1B47',      // Deep purple
      elevated: '#FFFFFF',
      hover: '#F3EFF8',
      active: '#E5DCF0',
    },
    text: {
      primary: '#1F1129',      // Dark purple
      secondary: '#5C4A6C',    // Muted purple
      muted: '#8B7A9C',        // Light purple gray
      disabled: '#C5BAD1',
      onAccent: '#FFFFFF',
    },
    accent: {
      primary: '#A855F7',      // Vivid purple
      secondary: '#EC4899',    // Pink
      tertiary: '#D946EF',     // Fuchsia
      hover: '#9333EA',
      active: '#7E22CE',
    },
    status: {
      success: '#22C55E',      // Bright green
      successSubtle: '#DCFCE7',
      warning: '#F59E0B',      // Amber
      warningSubtle: '#FEF3C7',
      error: '#EF4444',        // Red
      errorSubtle: '#FEE2E2',
      info: '#8B5CF6',         // Purple info
      infoSubtle: '#EDE9FE',
    },
    border: {
      default: '#E5DCF0',
      subtle: '#F3EFF8',
      focus: '#A855F7',
      hover: '#D4C9E0',
    },
    interactive: {
      default: '#F8F5FA',
      hover: '#EDE5F3',
      active: '#E5DCF0',
      disabled: '#F8F5FA',
      focus: '#A855F7',
    },
    input: {
      bg: '#FFFFFF',
      border: '#D4C9E0',
      borderHover: '#C5BAD1',
      borderFocus: '#A855F7',
      placeholder: '#8B7A9C',
      bgDisabled: '#F8F5FA',
    },
    overlay: {
      backdrop: 'rgba(31, 17, 41, 0.5)',
      tooltip: '#2D1B47',
      popover: '#FFFFFF',
    },
  },

  dark: {
    bg: {
      primary: '#0D0512',      // Near black with purple tint
      secondary: '#1A0F26',    // Dark purple
      card: '#1A0F26',         // Purple tinted cards
      sidebar: '#0D0512',      // Darkest purple
      elevated: '#1A0F26',
      hover: '#231536',
      active: '#2D1B47',
    },
    text: {
      primary: '#F8F5FA',      // Light lavender
      secondary: '#B8A8C8',    // Muted lavender
      muted: '#7A6A8C',        // Purple gray
      disabled: '#5C4A6C',
      onAccent: '#0D0512',
    },
    accent: {
      primary: '#A855F7',      // Vivid purple
      secondary: '#EC4899',    // Pink
      tertiary: '#D946EF',     // Fuchsia
      hover: '#C084FC',
      active: '#E0B3FF',
    },
    status: {
      success: '#22C55E',
      successSubtle: '#14532D',
      warning: '#F59E0B',
      warningSubtle: '#78350F',
      error: '#EF4444',
      errorSubtle: '#7F1D1D',
      info: '#8B5CF6',
      infoSubtle: '#4C1D95',
    },
    border: {
      default: '#2D1B47',
      subtle: '#1A0F26',
      focus: '#A855F7',
      hover: '#3D2857',
    },
    interactive: {
      default: '#1A0F26',
      hover: '#231536',
      active: '#2D1B47',
      disabled: '#1A0F26',
      focus: '#A855F7',
    },
    input: {
      bg: '#1A0F26',
      border: '#3D2857',
      borderHover: '#5C4A6C',
      borderFocus: '#A855F7',
      placeholder: '#7A6A8C',
      bgDisabled: '#1A0F26',
    },
    overlay: {
      backdrop: 'rgba(13, 5, 18, 0.75)',
      tooltip: '#2D1B47',
      popover: '#1A0F26',
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
    card: '0 2px 8px 0 rgb(168 85 247 / 0.08), 0 1px 3px -1px rgb(0 0 0 / 0.06)',
    elevated: '0 12px 24px -4px rgb(168 85 247 / 0.12), 0 6px 10px -6px rgb(0 0 0 / 0.08)',
    dropdown: '0 24px 40px -8px rgb(168 85 247 / 0.16), 0 12px 16px -8px rgb(0 0 0 / 0.10)',
  },

  chart: {
    colors: [
      '#A855F7', // Purple
      '#EC4899', // Pink
      '#D946EF', // Fuchsia
      '#8B5CF6', // Violet
      '#F472B6', // Light pink
    ],
    positive: '#22C55E',
    negative: '#EF4444',
  },
};
