import type { VisualTheme } from './types';

/**
 * Elegant Luxury Theme
 *
 * A sophisticated design with gold/champagne accents, cream backgrounds, and premium aesthetics.
 * Inspired by high-end luxury brands with refined typography and subtle elegance.
 */
export const elegantLuxuryTheme: VisualTheme = {
  id: 'elegantluxury',
  name: 'Elegant Luxury',
  description: 'Sophisticated design with gold accents and premium aesthetics',

  light: {
    bg: {
      primary: '#FAF9F6',      // Warm off-white
      secondary: '#F0EDE5',    // Cream
      card: '#FFFFFF',         // Pure white cards
      sidebar: '#2D2A26',      // Rich espresso
      elevated: '#FFFFFF',
      hover: '#F5F2ED',
      active: '#E5E0D8',
    },
    text: {
      primary: '#1A1814',      // Deep charcoal
      secondary: '#5C5650',    // Warm gray
      muted: '#8B857C',        // Muted taupe
      disabled: '#C4BFB7',
      onAccent: '#FFFFFF',
    },
    accent: {
      primary: '#B8860B',      // Dark goldenrod
      secondary: '#D4AF37',    // Metallic gold
      tertiary: '#C9A961',     // Light gold
      hover: '#9A7209',
      active: '#7D5E07',
    },
    status: {
      success: '#2E7D32',      // Forest green
      successSubtle: '#E8F5E9',
      warning: '#F9A825',      // Amber gold
      warningSubtle: '#FFF9E6',
      error: '#C62828',        // Deep red
      errorSubtle: '#FFEBEE',
      info: '#1565C0',         // Royal blue
      infoSubtle: '#E3F2FD',
    },
    border: {
      default: '#E5E0D8',      // Warm light gray
      subtle: '#F5F2ED',       // Very light cream
      focus: '#B8860B',
      hover: '#D4C9BD',
    },
    interactive: {
      default: '#FAF9F6',
      hover: '#F0EDE5',
      active: '#E5E0D8',
      disabled: '#FAF9F6',
      focus: '#B8860B',
    },
    input: {
      bg: '#FFFFFF',
      border: '#D4C9BD',
      borderHover: '#B8B2A7',
      borderFocus: '#B8860B',
      placeholder: '#8B857C',
      bgDisabled: '#FAF9F6',
    },
    overlay: {
      backdrop: 'rgba(26, 24, 20, 0.5)',
      tooltip: '#2D2A26',
      popover: '#FFFFFF',
    },
  },

  dark: {
    bg: {
      primary: '#1A1814',      // Deep charcoal
      secondary: '#2D2A26',    // Rich espresso
      card: '#2D2A26',         // Espresso cards
      sidebar: '#0F0D0A',      // Near black
      elevated: '#2D2A26',
      hover: '#3D3832',
      active: '#4D4842',
    },
    text: {
      primary: '#FAF9F6',      // Warm off-white
      secondary: '#B8B2A7',    // Warm light gray
      muted: '#7A756D',        // Muted taupe
      disabled: '#5C5650',
      onAccent: '#1A1814',
    },
    accent: {
      primary: '#D4AF37',      // Metallic gold
      secondary: '#C9A961',    // Light gold
      tertiary: '#E5C87D',     // Bright gold
      hover: '#E5C87D',
      active: '#F0E09D',
    },
    status: {
      success: '#4CAF50',
      successSubtle: '#1B5E20',
      warning: '#FFB300',
      warningSubtle: '#E65100',
      error: '#EF5350',
      errorSubtle: '#B71C1C',
      info: '#42A5F5',
      infoSubtle: '#0D47A1',
    },
    border: {
      default: '#3D3832',
      subtle: '#2D2A26',
      focus: '#D4AF37',
      hover: '#4D4842',
    },
    interactive: {
      default: '#2D2A26',
      hover: '#3D3832',
      active: '#4D4842',
      disabled: '#2D2A26',
      focus: '#D4AF37',
    },
    input: {
      bg: '#2D2A26',
      border: '#4D4842',
      borderHover: '#5C5650',
      borderFocus: '#D4AF37',
      placeholder: '#7A756D',
      bgDisabled: '#2D2A26',
    },
    overlay: {
      backdrop: 'rgba(15, 13, 10, 0.75)',
      tooltip: '#2D2A26',
      popover: '#2D2A26',
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
      tight: '-0.01em',
      normal: '0.01em',    // Slightly wider for elegance
      wide: '0.05em',      // Premium letter spacing
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
    sm: '0.375rem',    // Subtle curves
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    full: '9999px',
  },

  shadows: {
    card: '0 2px 8px 0 rgb(0 0 0 / 0.04), 0 1px 3px -1px rgb(0 0 0 / 0.03)',
    elevated: '0 8px 24px -4px rgb(0 0 0 / 0.08), 0 4px 8px -4px rgb(0 0 0 / 0.05)',
    dropdown: '0 16px 32px -8px rgb(0 0 0 / 0.12), 0 8px 12px -6px rgb(0 0 0 / 0.08)',
  },

  chart: {
    colors: [
      '#B8860B', // Dark goldenrod
      '#D4AF37', // Metallic gold
      '#8B4513', // Saddle brown
      '#2E7D32', // Forest green
      '#1565C0', // Royal blue
    ],
    positive: '#2E7D32',
    negative: '#C62828',
  },
};
