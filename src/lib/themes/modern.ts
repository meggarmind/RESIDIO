import type { VisualTheme } from './types';

/**
 * Modern Theme
 *
 * A contemporary design with blue-teal accents, generous spacing, and refined aesthetics.
 * Features a dark navy sidebar and softer, more rounded components.
 */
export const modernTheme: VisualTheme = {
  id: 'modern',
  name: 'Modern',
  description: 'Contemporary design with blue-teal accents and generous spacing',

  light: {
    bg: {
      primary: '#F5F6FA',      // Light gray background
      secondary: '#E5E7EB',
      card: '#FFFFFF',         // White cards
      sidebar: '#1E293B',      // Dark navy/slate sidebar
    },
    text: {
      primary: '#111827',
      secondary: '#6B7280',
      muted: '#9CA3AF',
    },
    accent: {
      primary: '#0EA5E9',      // Blue-teal
      secondary: '#14B8A6',    // Teal variant
      tertiary: '#06B6D4',     // Cyan
    },
    status: {
      success: '#10B981',      // Green
      warning: '#F59E0B',      // Amber
      error: '#EF4444',        // Red
      info: '#3B82F6',         // Blue
    },
    border: {
      default: '#E5E7EB',
      subtle: '#F3F4F6',
    },
  },

  dark: {
    bg: {
      primary: '#0F172A',
      secondary: '#1E293B',
      card: '#1E293B',
      sidebar: '#0F172A',      // Darker sidebar in dark mode
    },
    text: {
      primary: '#F9FAFB',
      secondary: '#9CA3AF',
      muted: '#6B7280',
    },
    accent: {
      primary: '#0EA5E9',      // Blue-teal (consistent)
      secondary: '#14B8A6',    // Teal variant
      tertiary: '#06B6D4',     // Cyan
    },
    status: {
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    },
    border: {
      default: '#374151',
      subtle: '#1E293B',
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
    sidebarWidth: '280px',     // Slightly wider
    contentPadding: {
      mobile: '1.25rem',       // More generous
      desktop: '2rem',         // More generous
    },
    cardGap: '1.5rem',         // More generous
    sectionMargin: '2rem',     // More generous
  },

  borderRadius: {
    sm: '0.5rem',    // 8px  - more generous
    md: '0.75rem',   // 12px - more generous
    lg: '1rem',      // 16px - more generous
    xl: '1.25rem',   // 20px - more generous
    full: '9999px',
  },

  shadows: {
    card: '0 2px 4px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
    elevated: '0 12px 20px -4px rgb(0 0 0 / 0.12), 0 6px 8px -6px rgb(0 0 0 / 0.08)',
    dropdown: '0 24px 32px -8px rgb(0 0 0 / 0.14), 0 12px 16px -8px rgb(0 0 0 / 0.10)',
  },

  chart: {
    colors: [
      '#0EA5E9', // blue-teal
      '#14B8A6', // teal
      '#06B6D4', // cyan
      '#8B5CF6', // purple
      '#F59E0B', // amber
    ],
    positive: '#10B981',
    negative: '#EF4444',
  },
};
