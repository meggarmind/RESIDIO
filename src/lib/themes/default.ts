import type { VisualTheme } from './types';

/**
 * Default Theme
 *
 * Preserves the current application styling that was previously known as "Nahid".
 * This is the foundational theme that maintains the existing UI appearance.
 */
export const defaultTheme: VisualTheme = {
  id: 'default',
  name: 'Default',
  description: 'Clean and modern design with mint green accents',

  light: {
    bg: {
      primary: '#F8F9FA',
      secondary: '#F3F4F6',
      card: '#FFFFFF',
      sidebar: '#FFFFFF',
      elevated: '#FFFFFF',
      hover: '#F3F4F6',
      active: '#E5E7EB',
    },
    text: {
      primary: '#111827',
      secondary: '#6B7280',
      muted: '#9CA3AF',
      disabled: '#D1D5DB',
      onAccent: '#FFFFFF',
    },
    accent: {
      primary: '#86EFAC', // mint
      secondary: '#C4B5FD', // lavender
      tertiary: '#5EEAD4', // teal
      hover: '#6EE7B7',
      active: '#4ADE80',
    },
    status: {
      success: '#22C55E',
      successSubtle: '#DCFCE7',
      warning: '#FDBA74',
      warningSubtle: '#FEF3C7',
      error: '#FDA4AF',
      errorSubtle: '#FEE2E2',
      info: '#60A5FA',
      infoSubtle: '#DBEAFE',
    },
    border: {
      default: '#E5E7EB',
      subtle: '#F3F4F6',
      focus: '#86EFAC',
      hover: '#D1D5DB',
    },
    interactive: {
      default: '#F9FAFB',
      hover: '#F3F4F6',
      active: '#E5E7EB',
      disabled: '#F9FAFB',
      focus: '#86EFAC',
    },
    input: {
      bg: '#FFFFFF',
      border: '#D1D5DB',
      borderHover: '#9CA3AF',
      borderFocus: '#86EFAC',
      placeholder: '#9CA3AF',
      bgDisabled: '#F9FAFB',
    },
    overlay: {
      backdrop: 'rgba(17, 24, 39, 0.5)',
      tooltip: '#1F2937',
      popover: '#FFFFFF',
    },
  },

  dark: {
    bg: {
      primary: '#0F172A',
      secondary: '#374151',
      card: '#1E293B',
      sidebar: '#111827',
      elevated: '#1E293B',
      hover: '#1E293B',
      active: '#334155',
    },
    text: {
      primary: '#F9FAFB',
      secondary: '#9CA3AF',
      muted: '#6B7280',
      disabled: '#4B5563',
      onAccent: '#111827',
    },
    accent: {
      primary: '#86EFAC', // mint (same as light)
      secondary: '#C4B5FD', // lavender
      tertiary: '#5EEAD4', // teal
      hover: '#6EE7B7',
      active: '#4ADE80',
    },
    status: {
      success: '#22C55E',
      successSubtle: '#14532D',
      warning: '#FDBA74',
      warningSubtle: '#78350F',
      error: '#FDA4AF',
      errorSubtle: '#7F1D1D',
      info: '#60A5FA',
      infoSubtle: '#1E3A8A',
    },
    border: {
      default: '#374151',
      subtle: '#1E293B',
      focus: '#86EFAC',
      hover: '#4B5563',
    },
    interactive: {
      default: '#1E293B',
      hover: '#334155',
      active: '#475569',
      disabled: '#1E293B',
      focus: '#86EFAC',
    },
    input: {
      bg: '#1E293B',
      border: '#4B5563',
      borderHover: '#6B7280',
      borderFocus: '#86EFAC',
      placeholder: '#6B7280',
      bgDisabled: '#1E293B',
    },
    overlay: {
      backdrop: 'rgba(15, 23, 42, 0.75)',
      tooltip: '#1F2937',
      popover: '#1E293B',
    },
  },

  typography: {
    fontFamily: {
      sans: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
      mono: 'var(--font-geist-mono), ui-monospace, monospace',
    },
    fontSize: {
      xs: '0.75rem',   // 12px
      sm: '0.875rem',  // 14px
      base: '1rem',    // 16px
      lg: '1.125rem',  // 18px
      xl: '1.25rem',   // 20px
      '2xl': '1.5rem', // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem',  // 36px
      '5xl': '3rem',     // 48px
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
    sidebarWidth: '256px',
    contentPadding: {
      mobile: '1rem',
      desktop: '1.5rem',
    },
    cardGap: '1rem',
    sectionMargin: '1.5rem',
  },

  borderRadius: {
    sm: '0.375rem',  // 6px
    md: '0.5rem',    // 8px
    lg: '0.625rem',  // 10px
    xl: '0.75rem',   // 12px
    full: '9999px',
  },

  shadows: {
    card: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    elevated: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    dropdown: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  },

  chart: {
    colors: [
      '#86EFAC', // mint
      '#C4B5FD', // lavender
      '#FDA4AF', // coral
      '#5EEAD4', // teal
      '#FDBA74', // orange
    ],
    positive: '#22C55E',
    negative: '#FDA4AF',
  },
};
