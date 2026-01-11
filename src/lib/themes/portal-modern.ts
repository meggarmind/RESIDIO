/**
 * Portal Modern Theme
 *
 * Minimalist, data-forward design system for the resident portal.
 * Based on asset management dashboard template with card-based architecture,
 * soft shadows, pastel accents, and clean typography.
 */

import type { VisualTheme } from './types';

export const portalModernTheme: VisualTheme = {
  id: 'portal-modern',
  name: 'Portal Modern',
  description: 'Clean, minimalist design with card-based layout and soft aesthetics',
  category: 'light',

  light: {
    bg: {
      primary: '#F5F7FA',      // Page background - light gray
      secondary: '#F3F4F6',    // Secondary background
      card: '#FFFFFF',         // Card surfaces - white
      sidebar: '#FFFFFF',      // Sidebar background
      elevated: '#FFFFFF',
      hover: '#F9FAFB',
      active: '#E5E7EB',
    },
    text: {
      primary: '#1F2937',      // Headings, important text
      secondary: '#4B5563',    // Body text
      muted: '#6B7280',        // Labels, captions
      disabled: '#9CA3AF',
      onAccent: '#FFFFFF',
    },
    accent: {
      primary: '#1E3A8A',      // Primary blue
      secondary: '#3B82F6',    // Lighter blue for links
      tertiary: '#06B6D4',     // Cyan accent
      hover: '#1E40AF',
      active: '#1E3A8A',
    },
    status: {
      success: '#10B981',      // Green
      successSubtle: '#D1FAE5',
      warning: '#F59E0B',      // Orange
      warningSubtle: '#FEF3C7',
      error: '#EF4444',        // Red
      errorSubtle: '#FEE2E2',
      info: '#3B82F6',         // Blue
      infoSubtle: '#DBEAFE',
    },
    border: {
      default: '#E5E7EB',      // Standard borders
      subtle: '#F3F4F6',       // Subtle dividers
      focus: '#3B82F6',
      hover: '#D1D5DB',
    },
    interactive: {
      default: '#F5F7FA',
      hover: '#F3F4F6',
      active: '#E5E7EB',
      disabled: '#F5F7FA',
      focus: '#3B82F6',
    },
    input: {
      bg: '#FFFFFF',
      border: '#D1D5DB',
      borderHover: '#9CA3AF',
      borderFocus: '#3B82F6',
      placeholder: '#6B7280',
      bgDisabled: '#F5F7FA',
    },
    overlay: {
      backdrop: 'rgba(31, 41, 55, 0.5)',
      tooltip: '#1F2937',
      popover: '#FFFFFF',
    },
  },

  dark: {
    bg: {
      primary: '#0F172A',      // Page background - dark navy
      secondary: '#1E293B',    // Secondary background
      card: '#1E293B',         // Card surfaces - slate
      sidebar: '#0F172A',      // Sidebar background
      elevated: '#1E293B',
      hover: '#334155',
      active: '#475569',
    },
    text: {
      primary: '#F1F5F9',      // Headings - light gray
      secondary: '#CBD5E1',    // Body text
      muted: '#94A3B8',        // Labels, captions
      disabled: '#64748B',
      onAccent: '#0F172A',
    },
    accent: {
      primary: '#3B82F6',      // Primary blue (lighter for dark)
      secondary: '#60A5FA',    // Lighter blue
      tertiary: '#22D3EE',     // Cyan accent (brighter)
      hover: '#60A5FA',
      active: '#93C5FD',
    },
    status: {
      success: '#34D399',      // Green (brighter)
      successSubtle: '#064E3B',
      warning: '#FBBF24',      // Orange (brighter)
      warningSubtle: '#78350F',
      error: '#F87171',        // Red (brighter)
      errorSubtle: '#7F1D1D',
      info: '#60A5FA',         // Blue (brighter)
      infoSubtle: '#1E3A8A',
    },
    border: {
      default: '#334155',      // Standard borders
      subtle: '#1E293B',       // Subtle dividers
      focus: '#3B82F6',
      hover: '#475569',
    },
    interactive: {
      default: '#1E293B',
      hover: '#334155',
      active: '#475569',
      disabled: '#1E293B',
      focus: '#3B82F6',
    },
    input: {
      bg: '#1E293B',
      border: '#475569',
      borderHover: '#64748B',
      borderFocus: '#3B82F6',
      placeholder: '#94A3B8',
      bgDisabled: '#1E293B',
    },
    overlay: {
      backdrop: 'rgba(15, 23, 42, 0.75)',
      tooltip: '#1E293B',
      popover: '#1E293B',
    },
  },

  typography: {
    fontFamily: {
      sans: "'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      mono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    },
    fontSize: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '30px',
      '4xl': '36px',
      '5xl': '48px',
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
      tight: '-0.025em',
      normal: '0',
      wide: '0.05em',
    },
  },

  spacing: {
    sidebarWidth: '80px',      // Narrow icon-only sidebar
    contentPadding: {
      mobile: '16px',
      desktop: '24px',
    },
    cardGap: '16px',           // Gap between cards
    sectionMargin: '32px',     // Gap between sections
  },

  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  shadows: {
    card: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
    elevated: '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.06)',
    dropdown: '0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
  },

  chart: {
    colors: [
      '#3B82F6',  // Blue
      '#10B981',  // Green
      '#F59E0B',  // Orange
      '#8B5CF6',  // Purple
      '#06B6D4',  // Cyan
      '#EC4899',  // Pink
    ],
    positive: '#10B981',
    negative: '#EF4444',
  },
};
