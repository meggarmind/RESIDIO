import type { VisualTheme } from './types';

/**
 * Paier Theme
 *
 * A modern fintech aesthetic with dark navy sidebar and mint green accents.
 * Based on the Paier Dashboard Design Specification.
 *
 * Key characteristics:
 * - Dark navy sidebar (#1E2A38)
 * - Mint green primary accent (#4ADE80)
 * - Soft green for CTAs (#22C55E)
 * - Coral pink for warnings (#EC4899)
 * - Clean, professional typography
 * - Larger border radius for modern feel
 */
export const paierTheme: VisualTheme = {
  id: 'paier',
  name: 'Paier',
  description: 'Modern fintech aesthetic with dark navy sidebar and mint green accents',

  light: {
    bg: {
      primary: '#F5F7F9',      // Off-white main background
      secondary: '#F9FAFB',    // Subtle secondary background
      card: '#FFFFFF',         // White card backgrounds
      sidebar: '#1E2A38',      // Dark navy sidebar
    },
    text: {
      primary: '#111827',      // Dark text on light backgrounds
      secondary: '#6B7280',    // Muted secondary text
      muted: '#9CA3AF',        // Even more muted text
    },
    accent: {
      primary: '#4ADE80',      // Mint green primary accent
      secondary: '#22C55E',    // Soft green for CTAs
      tertiary: '#EC4899',     // Coral pink for warnings
    },
    status: {
      success: '#22C55E',      // Green for completed states
      warning: '#FEF3C7',      // Yellow background for processing
      error: '#F472B6',        // Pink for alerts and overdue
      info: '#4ADE80',         // Mint green for info
    },
    border: {
      default: '#E5E7EB',      // Subtle borders
      subtle: '#F3F4F6',       // Very subtle borders
    },
  },

  dark: {
    bg: {
      primary: '#0F172A',      // Dark slate background
      secondary: '#1E293B',    // Slightly lighter secondary
      card: '#1E293B',         // Dark card backgrounds
      sidebar: '#1E2A38',      // Keep dark navy sidebar consistent
    },
    text: {
      primary: '#F9FAFB',      // Light text on dark backgrounds
      secondary: '#9CA3AF',    // Muted secondary text
      muted: '#6B7280',        // Even more muted text
    },
    accent: {
      primary: '#4ADE80',      // Mint green (same as light mode)
      secondary: '#22C55E',    // Soft green (same as light mode)
      tertiary: '#EC4899',     // Coral pink (same as light mode)
    },
    status: {
      success: '#22C55E',      // Green for completed states
      warning: '#FEF3C7',      // Yellow background for processing
      error: '#F472B6',        // Pink for alerts and overdue
      info: '#4ADE80',         // Mint green for info
    },
    border: {
      default: '#374151',      // Subtle borders on dark
      subtle: '#1F2937',       // Very subtle borders on dark
    },
  },

  typography: {
    fontFamily: {
      sans: 'Inter, SF Pro Display, system-ui, -apple-system, sans-serif',
      mono: 'ui-monospace, Consolas, monospace',
    },
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '2.25rem', // 36px
      '4xl': '3rem',    // 48px
      '5xl': '4.5rem',  // 72px
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.6,
    },
    letterSpacing: {
      tight: '-0.025em',
      normal: '0',
      wide: '0.025em',
    },
  },

  spacing: {
    sidebarWidth: '200px',
    contentPadding: {
      mobile: '1rem',
      desktop: '1.5rem',
    },
    cardGap: '1rem',
    sectionMargin: '1.5rem',
  },

  borderRadius: {
    sm: '0.5rem',    // 8px - buttons, inputs
    md: '0.75rem',   // 12px - smaller cards
    lg: '1rem',      // 16px - cards, status badges (pill)
    xl: '1.5rem',    // 24px - large containers, pill buttons
    full: '9999px',  // Full circle for avatars
  },

  shadows: {
    card: '0 1px 3px rgba(0, 0, 0, 0.1)',
    elevated: '0 4px 6px rgba(0, 0, 0, 0.1)',
    dropdown: '0 10px 40px rgba(0, 0, 0, 0.1)',
  },

  chart: {
    colors: [
      '#4ADE80', // Mint green
      '#22C55E', // Soft green
      '#EC4899', // Coral pink
      '#60A5FA', // Blue
      '#F59E0B', // Amber
      '#8B5CF6', // Purple
      '#14B8A6', // Teal
      '#F472B6', // Pink
    ],
    positive: '#22C55E',  // Soft green for positive values
    negative: '#F472B6',  // Pink for negative values
  },
};
