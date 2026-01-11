import type { VisualTheme } from './types';

/**
 * Supabase Theme
 *
 * A developer-focused theme inspired by Supabase's brand colors.
 * Features green accents on dark backgrounds with excellent readability.
 */
export const supabaseTheme: VisualTheme = {
  id: 'supabase',
  name: 'Supabase',
  description: 'Developer-focused theme with Supabase green accents',

  light: {
    bg: {
      primary: '#F8FAFC',      // Light slate
      secondary: '#F1F5F9',    // Lighter slate
      card: '#FFFFFF',         // White cards
      sidebar: '#1C1C1C',      // Near black
      elevated: '#FFFFFF',
      hover: '#F1F5F9',
      active: '#E2E8F0',
    },
    text: {
      primary: '#0F172A',      // Slate 900
      secondary: '#475569',    // Slate 600
      muted: '#94A3B8',        // Slate 400
      disabled: '#CBD5E1',
      onAccent: '#FFFFFF',
    },
    accent: {
      primary: '#3ECF8E',      // Supabase green
      secondary: '#10B981',    // Emerald
      tertiary: '#6EE7B7',     // Light emerald
      hover: '#2BB377',
      active: '#22916A',
    },
    status: {
      success: '#3ECF8E',      // Supabase green
      successSubtle: '#D1FAE5',
      warning: '#F59E0B',      // Amber
      warningSubtle: '#FEF3C7',
      error: '#EF4444',        // Red
      errorSubtle: '#FEE2E2',
      info: '#3B82F6',         // Blue
      infoSubtle: '#DBEAFE',
    },
    border: {
      default: '#E2E8F0',      // Slate 200
      subtle: '#F1F5F9',       // Slate 100
      focus: '#3ECF8E',
      hover: '#CBD5E1',
    },
    interactive: {
      default: '#F8FAFC',
      hover: '#F1F5F9',
      active: '#E2E8F0',
      disabled: '#F8FAFC',
      focus: '#3ECF8E',
    },
    input: {
      bg: '#FFFFFF',
      border: '#CBD5E1',
      borderHover: '#94A3B8',
      borderFocus: '#3ECF8E',
      placeholder: '#94A3B8',
      bgDisabled: '#F8FAFC',
    },
    overlay: {
      backdrop: 'rgba(15, 23, 42, 0.5)',
      tooltip: '#1C1C1C',
      popover: '#FFFFFF',
    },
  },

  dark: {
    bg: {
      primary: '#1C1C1C',      // Near black (Supabase style)
      secondary: '#2A2A2A',    // Dark gray
      card: '#2A2A2A',         // Dark gray cards
      sidebar: '#141414',      // Darkest
      elevated: '#2A2A2A',
      hover: '#3A3A3A',
      active: '#4A4A4A',
    },
    text: {
      primary: '#F8FAFC',      // Slate 50
      secondary: '#94A3B8',    // Slate 400
      muted: '#64748B',        // Slate 500
      disabled: '#475569',
      onAccent: '#0F172A',
    },
    accent: {
      primary: '#3ECF8E',      // Supabase green
      secondary: '#10B981',    // Emerald
      tertiary: '#6EE7B7',     // Light emerald
      hover: '#5EDFAA',
      active: '#7EE9BB',
    },
    status: {
      success: '#3ECF8E',
      successSubtle: '#064E3B',
      warning: '#F59E0B',
      warningSubtle: '#78350F',
      error: '#EF4444',
      errorSubtle: '#7F1D1D',
      info: '#3B82F6',
      infoSubtle: '#1E3A8A',
    },
    border: {
      default: '#3A3A3A',
      subtle: '#2A2A2A',
      focus: '#3ECF8E',
      hover: '#4A4A4A',
    },
    interactive: {
      default: '#2A2A2A',
      hover: '#3A3A3A',
      active: '#4A4A4A',
      disabled: '#2A2A2A',
      focus: '#3ECF8E',
    },
    input: {
      bg: '#2A2A2A',
      border: '#4A4A4A',
      borderHover: '#64748B',
      borderFocus: '#3ECF8E',
      placeholder: '#64748B',
      bgDisabled: '#2A2A2A',
    },
    overlay: {
      backdrop: 'rgba(20, 20, 20, 0.75)',
      tooltip: '#2A2A2A',
      popover: '#2A2A2A',
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
    sm: '0.375rem',    // Supabase uses slightly smaller radii
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    full: '9999px',
  },

  shadows: {
    card: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    elevated: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    dropdown: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  },

  chart: {
    colors: [
      '#3ECF8E', // Supabase green
      '#10B981', // Emerald
      '#3B82F6', // Blue
      '#8B5CF6', // Purple
      '#F59E0B', // Amber
    ],
    positive: '#3ECF8E',
    negative: '#EF4444',
  },
};
