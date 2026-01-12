/**
 * tweakcn.com Theme Registry
 *
 * This registry contains curated themes from tweakcn.com that use OKLCH color space
 * for precise color management across light/dark modes.
 *
 * IMPORTANT: These themes use OKLCH format, NOT HSL!
 * Example: oklch(0.6397 0.1720 36.4421) - do NOT wrap in hsl()
 *
 * Phase 1 Implementation: 3 themes for testing
 * - Supabase (developer-focused, Outfit font)
 * - Doom-64 (retro gaming, Oxanium font, sharp corners)
 * - Catppuccin (popular community theme, Montserrat font)
 *
 * Phase 2 will add remaining 7 themes.
 */

import { TweakcnTheme, ThemeRegistry } from '@/types/theme';

/**
 * Add legacy compatibility properties to a theme
 * This enables backward compatibility with old VisualTheme interface
 */
function addLegacyProperties(theme: TweakcnTheme): TweakcnTheme {
  const themeVars = theme.cssVars.theme;
  const lightColors = theme.cssVars.light;

  return {
    ...theme,
    typography: {
      fontFamily: {
        sans: themeVars['font-sans'],
        mono: themeVars['font-mono'],
        serif: themeVars['font-serif'],
      },
    },
    borderRadius: {
      sm: themeVars.radius,
      md: themeVars.radius,
      lg: themeVars.radius,
      xl: themeVars.radius,
    },
    shadows: {
      card: `0 1px 3px 0 ${lightColors.border}`,
      elevated: `0 4px 6px -1px ${lightColors.border}`,
      dropdown: `0 10px 15px -3px ${lightColors.border}`,
    },
  };
}

// ============================================================================
// THEME 1: SUPABASE
// ============================================================================

const supabaseTheme: TweakcnTheme = {
  id: 'supabase',
  name: 'Supabase',
  description: 'Clean developer-focused theme with Outfit typography and balanced green accents',
  category: 'auto',
  cssVars: {
    theme: {
      'font-sans': 'Outfit, ui-sans-serif, system-ui, sans-serif',
      'font-mono': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-serif': 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      radius: '0.5rem',
      'tracking-tighter': '-0.05em',
      'tracking-tight': '-0.025em',
      'tracking-wide': '0.025em',
      'tracking-wider': '0.05em',
      'tracking-widest': '0.1em',
    },
    light: {
      background: 'oklch(0.9882 0.0039 166.7437)',
      foreground: 'oklch(0.1765 0.0392 166.6629)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.1765 0.0392 166.6629)',
      popover: 'oklch(1 0 0)',
      'popover-foreground': 'oklch(0.1765 0.0392 166.6629)',
      primary: 'oklch(0.4706 0.1059 166.1429)',
      'primary-foreground': 'oklch(0.9882 0.0196 166.7437)',
      secondary: 'oklch(0.9647 0.0157 166.7437)',
      'secondary-foreground': 'oklch(0.1765 0.0392 166.6629)',
      muted: 'oklch(0.9647 0.0157 166.7437)',
      'muted-foreground': 'oklch(0.5098 0.0784 166.1429)',
      accent: 'oklch(0.9647 0.0157 166.7437)',
      'accent-foreground': 'oklch(0.1765 0.0392 166.6629)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9882 0.0196 166.7437)',
      border: 'oklch(0.9216 0.0196 166.7437)',
      input: 'oklch(0.9216 0.0196 166.7437)',
      ring: 'oklch(0.4706 0.1059 166.1429)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
    dark: {
      background: 'oklch(0.1373 0.0196 166.1429)',
      foreground: 'oklch(0.9882 0.0196 166.7437)',
      card: 'oklch(0.1765 0.0314 166.1429)',
      'card-foreground': 'oklch(0.9882 0.0196 166.7437)',
      popover: 'oklch(0.1765 0.0314 166.1429)',
      'popover-foreground': 'oklch(0.9882 0.0196 166.7437)',
      primary: 'oklch(0.5882 0.1373 166.1429)',
      'primary-foreground': 'oklch(0.1765 0.0392 166.6629)',
      secondary: 'oklch(0.2549 0.0392 166.1429)',
      'secondary-foreground': 'oklch(0.9882 0.0196 166.7437)',
      muted: 'oklch(0.2549 0.0392 166.1429)',
      'muted-foreground': 'oklch(0.7294 0.0784 166.1429)',
      accent: 'oklch(0.2549 0.0392 166.1429)',
      'accent-foreground': 'oklch(0.9882 0.0196 166.7437)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9882 0.0196 166.7437)',
      border: 'oklch(0.2549 0.0392 166.1429)',
      input: 'oklch(0.2549 0.0392 166.1429)',
      ring: 'oklch(0.5882 0.1373 166.1429)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
  },
};

// ============================================================================
// THEME 2: DOOM-64
// ============================================================================

const doom64Theme: TweakcnTheme = {
  id: 'doom-64',
  name: 'DOOM-64',
  description: 'Retro-inspired gaming theme with Oxanium font, sharp corners, and vibrant orange/green accents',
  category: 'auto',
  cssVars: {
    theme: {
      'font-sans': 'Oxanium, ui-sans-serif, system-ui, sans-serif',
      'font-mono': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-serif': 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      radius: '0px', // Sharp corners!
      'tracking-tighter': '-0.05em',
      'tracking-tight': '-0.025em',
      'tracking-wide': '0.025em',
      'tracking-wider': '0.05em',
      'tracking-widest': '0.1em',
    },
    light: {
      background: 'oklch(0.9843 0.0078 109.7692)',
      foreground: 'oklch(0.1608 0.0196 109.7692)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.1608 0.0196 109.7692)',
      popover: 'oklch(1 0 0)',
      'popover-foreground': 'oklch(0.1608 0.0196 109.7692)',
      primary: 'oklch(0.6000 0.1804 36.8442)',
      'primary-foreground': 'oklch(0.9843 0.0078 109.7692)',
      secondary: 'oklch(0.9608 0.0078 109.7692)',
      'secondary-foreground': 'oklch(0.1608 0.0196 109.7692)',
      muted: 'oklch(0.9608 0.0078 109.7692)',
      'muted-foreground': 'oklch(0.5020 0.0510 109.7692)',
      accent: 'oklch(0.6392 0.1725 148.3937)',
      'accent-foreground': 'oklch(0.9843 0.0078 109.7692)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9843 0.0078 109.7692)',
      border: 'oklch(0.9216 0.0157 109.7692)',
      input: 'oklch(0.9216 0.0157 109.7692)',
      ring: 'oklch(0.6000 0.1804 36.8442)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
    dark: {
      background: 'oklch(0.1216 0.0196 109.7692)',
      foreground: 'oklch(0.9843 0.0078 109.7692)',
      card: 'oklch(0.1608 0.0196 109.7692)',
      'card-foreground': 'oklch(0.9843 0.0078 109.7692)',
      popover: 'oklch(0.1608 0.0196 109.7692)',
      'popover-foreground': 'oklch(0.9843 0.0078 109.7692)',
      primary: 'oklch(0.6784 0.2039 36.4421)',
      'primary-foreground': 'oklch(0.1608 0.0196 109.7692)',
      secondary: 'oklch(0.2392 0.0314 109.7692)',
      'secondary-foreground': 'oklch(0.9843 0.0078 109.7692)',
      muted: 'oklch(0.2392 0.0314 109.7692)',
      'muted-foreground': 'oklch(0.7216 0.0510 109.7692)',
      accent: 'oklch(0.7176 0.1922 148.7919)',
      'accent-foreground': 'oklch(0.1608 0.0196 109.7692)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9843 0.0078 109.7692)',
      border: 'oklch(0.2392 0.0314 109.7692)',
      input: 'oklch(0.2392 0.0314 109.7692)',
      ring: 'oklch(0.6784 0.2039 36.4421)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
  },
};

// ============================================================================
// THEME 3: CATPPUCCIN
// ============================================================================

const catppuccinTheme: TweakcnTheme = {
  id: 'catppuccin',
  name: 'Catppuccin',
  description: 'Popular community theme with Montserrat typography and soothing purple accents',
  category: 'auto',
  cssVars: {
    theme: {
      'font-sans': 'Montserrat, ui-sans-serif, system-ui, sans-serif',
      'font-mono': 'Fira Code, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-serif': 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      radius: '0.35rem',
      'tracking-tighter': '-0.05em',
      'tracking-tight': '-0.025em',
      'tracking-wide': '0.025em',
      'tracking-wider': '0.05em',
      'tracking-widest': '0.1em',
    },
    light: {
      background: 'oklch(0.9765 0.0078 264.0538)',
      foreground: 'oklch(0.3294 0.0314 264.0538)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.3294 0.0314 264.0538)',
      popover: 'oklch(1 0 0)',
      'popover-foreground': 'oklch(0.3294 0.0314 264.0538)',
      primary: 'oklch(0.5529 0.1686 264.0538)',
      'primary-foreground': 'oklch(0.9765 0.0078 264.0538)',
      secondary: 'oklch(0.9451 0.0157 264.0538)',
      'secondary-foreground': 'oklch(0.3294 0.0314 264.0538)',
      muted: 'oklch(0.9451 0.0157 264.0538)',
      'muted-foreground': 'oklch(0.5647 0.0627 264.0538)',
      accent: 'oklch(0.7255 0.1686 192.1771)',
      'accent-foreground': 'oklch(0.3294 0.0314 264.0538)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9765 0.0078 264.0538)',
      border: 'oklch(0.9059 0.0157 264.0538)',
      input: 'oklch(0.9059 0.0157 264.0538)',
      ring: 'oklch(0.5529 0.1686 264.0538)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
    dark: {
      background: 'oklch(0.2039 0.0314 264.0538)',
      foreground: 'oklch(0.9765 0.0078 264.0538)',
      card: 'oklch(0.2471 0.0314 264.0538)',
      'card-foreground': 'oklch(0.9765 0.0078 264.0538)',
      popover: 'oklch(0.2471 0.0314 264.0538)',
      'popover-foreground': 'oklch(0.9765 0.0078 264.0538)',
      primary: 'oklch(0.6784 0.2039 264.0538)',
      'primary-foreground': 'oklch(0.2039 0.0314 264.0538)',
      secondary: 'oklch(0.3098 0.0392 264.0538)',
      'secondary-foreground': 'oklch(0.9765 0.0078 264.0538)',
      muted: 'oklch(0.3098 0.0392 264.0538)',
      'muted-foreground': 'oklch(0.7843 0.0627 264.0538)',
      accent: 'oklch(0.7255 0.1686 192.1771)',
      'accent-foreground': 'oklch(0.9765 0.0078 264.0538)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9765 0.0078 264.0538)',
      border: 'oklch(0.3098 0.0392 264.0538)',
      input: 'oklch(0.3098 0.0392 264.0538)',
      ring: 'oklch(0.6784 0.2039 264.0538)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
  },
};

// ============================================================================
// THEME 4: ELEGANT LUXURY
// ============================================================================

const elegantLuxuryTheme: TweakcnTheme = {
  id: 'elegant-luxury',
  name: 'Elegant Luxury',
  description: 'Sophisticated theme with Poppins and Libre Baskerville typography',
  category: 'auto',
  cssVars: {
    theme: {
      'font-sans': 'Poppins, ui-sans-serif, system-ui, sans-serif',
      'font-mono': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-serif': 'Libre Baskerville, ui-serif, Georgia, Cambria, serif',
      radius: '0.375rem',
      'tracking-tighter': '-0.05em',
      'tracking-tight': '-0.025em',
      'tracking-wide': '0.025em',
      'tracking-wider': '0.05em',
      'tracking-widest': '0.1em',
    },
    light: {
      background: 'oklch(0.9922 0.0039 264.0538)',
      foreground: 'oklch(0.1569 0.0196 264.0538)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.1569 0.0196 264.0538)',
      popover: 'oklch(1 0 0)',
      'popover-foreground': 'oklch(0.1569 0.0196 264.0538)',
      primary: 'oklch(0.3373 0.0588 264.0538)',
      'primary-foreground': 'oklch(0.9922 0.0039 264.0538)',
      secondary: 'oklch(0.9686 0.0157 264.0538)',
      'secondary-foreground': 'oklch(0.1569 0.0196 264.0538)',
      muted: 'oklch(0.9686 0.0157 264.0538)',
      'muted-foreground': 'oklch(0.4980 0.0392 264.0538)',
      accent: 'oklch(0.8235 0.1216 49.0588)',
      'accent-foreground': 'oklch(0.1569 0.0196 264.0538)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9922 0.0039 264.0538)',
      border: 'oklch(0.9294 0.0196 264.0538)',
      input: 'oklch(0.9294 0.0196 264.0538)',
      ring: 'oklch(0.3373 0.0588 264.0538)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
    dark: {
      background: 'oklch(0.1255 0.0196 264.0538)',
      foreground: 'oklch(0.9922 0.0039 264.0538)',
      card: 'oklch(0.1569 0.0196 264.0538)',
      'card-foreground': 'oklch(0.9922 0.0039 264.0538)',
      popover: 'oklch(0.1569 0.0196 264.0538)',
      'popover-foreground': 'oklch(0.9922 0.0039 264.0538)',
      primary: 'oklch(0.9020 0.0392 264.0538)',
      'primary-foreground': 'oklch(0.1569 0.0196 264.0538)',
      secondary: 'oklch(0.2392 0.0314 264.0538)',
      'secondary-foreground': 'oklch(0.9922 0.0039 264.0538)',
      muted: 'oklch(0.2392 0.0314 264.0538)',
      'muted-foreground': 'oklch(0.7137 0.0392 264.0538)',
      accent: 'oklch(0.8235 0.1216 49.0588)',
      'accent-foreground': 'oklch(0.1569 0.0196 264.0538)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9922 0.0039 264.0538)',
      border: 'oklch(0.2392 0.0314 264.0538)',
      input: 'oklch(0.2392 0.0314 264.0538)',
      ring: 'oklch(0.9020 0.0392 264.0538)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
  },
};

// ============================================================================
// THEME 5: TANGERINE
// ============================================================================

const tangerineTheme: TweakcnTheme = {
  id: 'tangerine',
  name: 'Tangerine',
  description: 'Fresh citrus theme with Inter and Source Serif 4 typography',
  category: 'auto',
  cssVars: {
    theme: {
      'font-sans': 'Inter, ui-sans-serif, system-ui, sans-serif',
      'font-mono': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-serif': 'Source Serif 4, ui-serif, Georgia, Cambria, serif',
      radius: '0.75rem',
      'tracking-tighter': '-0.05em',
      'tracking-tight': '-0.025em',
      'tracking-wide': '0.025em',
      'tracking-wider': '0.05em',
      'tracking-widest': '0.1em',
    },
    light: {
      background: 'oklch(0.9882 0.0078 82.3529)',
      foreground: 'oklch(0.1647 0.0196 82.3529)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.1647 0.0196 82.3529)',
      popover: 'oklch(1 0 0)',
      'popover-foreground': 'oklch(0.1647 0.0196 82.3529)',
      primary: 'oklch(0.6471 0.1804 46.4706)',
      'primary-foreground': 'oklch(0.9882 0.0078 82.3529)',
      secondary: 'oklch(0.9647 0.0157 82.3529)',
      'secondary-foreground': 'oklch(0.1647 0.0196 82.3529)',
      muted: 'oklch(0.9647 0.0157 82.3529)',
      'muted-foreground': 'oklch(0.5059 0.0392 82.3529)',
      accent: 'oklch(0.9647 0.0157 82.3529)',
      'accent-foreground': 'oklch(0.1647 0.0196 82.3529)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9882 0.0078 82.3529)',
      border: 'oklch(0.9216 0.0196 82.3529)',
      input: 'oklch(0.9216 0.0196 82.3529)',
      ring: 'oklch(0.6471 0.1804 46.4706)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
    dark: {
      background: 'oklch(0.1373 0.0196 82.3529)',
      foreground: 'oklch(0.9882 0.0078 82.3529)',
      card: 'oklch(0.1765 0.0196 82.3529)',
      'card-foreground': 'oklch(0.9882 0.0078 82.3529)',
      popover: 'oklch(0.1765 0.0196 82.3529)',
      'popover-foreground': 'oklch(0.9882 0.0078 82.3529)',
      primary: 'oklch(0.7294 0.2039 46.0706)',
      'primary-foreground': 'oklch(0.1647 0.0196 82.3529)',
      secondary: 'oklch(0.2549 0.0314 82.3529)',
      'secondary-foreground': 'oklch(0.9882 0.0078 82.3529)',
      muted: 'oklch(0.2549 0.0314 82.3529)',
      'muted-foreground': 'oklch(0.7255 0.0392 82.3529)',
      accent: 'oklch(0.2549 0.0314 82.3529)',
      'accent-foreground': 'oklch(0.9882 0.0078 82.3529)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9882 0.0078 82.3529)',
      border: 'oklch(0.2549 0.0314 82.3529)',
      input: 'oklch(0.2549 0.0314 82.3529)',
      ring: 'oklch(0.7294 0.2039 46.0706)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
  },
};

// ============================================================================
// THEME 6: CAFFEINE
// ============================================================================

const caffeineTheme: TweakcnTheme = {
  id: 'caffeine',
  name: 'Caffeine',
  description: 'Warm coffee-inspired theme with system fonts',
  category: 'auto',
  cssVars: {
    theme: {
      'font-sans': 'ui-sans-serif, system-ui, sans-serif',
      'font-mono': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-serif': 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      radius: '0.5rem',
      'tracking-tighter': '-0.05em',
      'tracking-tight': '-0.025em',
      'tracking-wide': '0.025em',
      'tracking-wider': '0.05em',
      'tracking-widest': '0.1em',
    },
    light: {
      background: 'oklch(0.9804 0.0118 82.3529)',
      foreground: 'oklch(0.2510 0.0510 49.0588)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.2510 0.0510 49.0588)',
      popover: 'oklch(1 0 0)',
      'popover-foreground': 'oklch(0.2510 0.0510 49.0588)',
      primary: 'oklch(0.4627 0.1137 49.0588)',
      'primary-foreground': 'oklch(0.9804 0.0118 82.3529)',
      secondary: 'oklch(0.9529 0.0196 49.0588)',
      'secondary-foreground': 'oklch(0.2510 0.0510 49.0588)',
      muted: 'oklch(0.9529 0.0196 49.0588)',
      'muted-foreground': 'oklch(0.5176 0.0706 49.0588)',
      accent: 'oklch(0.9529 0.0196 49.0588)',
      'accent-foreground': 'oklch(0.2510 0.0510 49.0588)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9804 0.0118 82.3529)',
      border: 'oklch(0.9098 0.0235 49.0588)',
      input: 'oklch(0.9098 0.0235 49.0588)',
      ring: 'oklch(0.4627 0.1137 49.0588)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
    dark: {
      background: 'oklch(0.1843 0.0314 49.0588)',
      foreground: 'oklch(0.9804 0.0118 82.3529)',
      card: 'oklch(0.2235 0.0392 49.0588)',
      'card-foreground': 'oklch(0.9804 0.0118 82.3529)',
      popover: 'oklch(0.2235 0.0392 49.0588)',
      'popover-foreground': 'oklch(0.9804 0.0118 82.3529)',
      primary: 'oklch(0.7020 0.1608 49.0588)',
      'primary-foreground': 'oklch(0.2510 0.0510 49.0588)',
      secondary: 'oklch(0.2941 0.0471 49.0588)',
      'secondary-foreground': 'oklch(0.9804 0.0118 82.3529)',
      muted: 'oklch(0.2941 0.0471 49.0588)',
      'muted-foreground': 'oklch(0.7373 0.0706 49.0588)',
      accent: 'oklch(0.2941 0.0471 49.0588)',
      'accent-foreground': 'oklch(0.9804 0.0118 82.3529)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9804 0.0118 82.3529)',
      border: 'oklch(0.2941 0.0471 49.0588)',
      input: 'oklch(0.2941 0.0471 49.0588)',
      ring: 'oklch(0.7020 0.1608 49.0588)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
  },
};

// ============================================================================
// THEME 7: OCEAN BREEZE
// ============================================================================

const oceanBreezeTheme: TweakcnTheme = {
  id: 'ocean-breeze',
  name: 'Ocean Breeze',
  description: 'Refreshing aqua theme with DM Sans and Lora typography',
  category: 'auto',
  cssVars: {
    theme: {
      'font-sans': 'DM Sans, ui-sans-serif, system-ui, sans-serif',
      'font-mono': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-serif': 'Lora, ui-serif, Georgia, Cambria, serif',
      radius: '0.5rem',
      'tracking-tighter': '-0.05em',
      'tracking-tight': '-0.025em',
      'tracking-wide': '0.025em',
      'tracking-wider': '0.05em',
      'tracking-widest': '0.1em',
    },
    light: {
      background: 'oklch(0.9843 0.0078 220.0000)',
      foreground: 'oklch(0.1647 0.0392 220.0000)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.1647 0.0392 220.0000)',
      popover: 'oklch(1 0 0)',
      'popover-foreground': 'oklch(0.1647 0.0392 220.0000)',
      primary: 'oklch(0.5490 0.1294 220.0000)',
      'primary-foreground': 'oklch(0.9843 0.0078 220.0000)',
      secondary: 'oklch(0.9608 0.0157 220.0000)',
      'secondary-foreground': 'oklch(0.1647 0.0392 220.0000)',
      muted: 'oklch(0.9608 0.0157 220.0000)',
      'muted-foreground': 'oklch(0.5059 0.0784 220.0000)',
      accent: 'oklch(0.7765 0.1373 192.1771)',
      'accent-foreground': 'oklch(0.1647 0.0392 220.0000)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9843 0.0078 220.0000)',
      border: 'oklch(0.9216 0.0196 220.0000)',
      input: 'oklch(0.9216 0.0196 220.0000)',
      ring: 'oklch(0.5490 0.1294 220.0000)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
    dark: {
      background: 'oklch(0.1373 0.0314 220.0000)',
      foreground: 'oklch(0.9843 0.0078 220.0000)',
      card: 'oklch(0.1765 0.0392 220.0000)',
      'card-foreground': 'oklch(0.9843 0.0078 220.0000)',
      popover: 'oklch(0.1765 0.0392 220.0000)',
      'popover-foreground': 'oklch(0.9843 0.0078 220.0000)',
      primary: 'oklch(0.6667 0.1569 220.0000)',
      'primary-foreground': 'oklch(0.1647 0.0392 220.0000)',
      secondary: 'oklch(0.2549 0.0471 220.0000)',
      'secondary-foreground': 'oklch(0.9843 0.0078 220.0000)',
      muted: 'oklch(0.2549 0.0471 220.0000)',
      'muted-foreground': 'oklch(0.7255 0.0784 220.0000)',
      accent: 'oklch(0.7765 0.1373 192.1771)',
      'accent-foreground': 'oklch(0.1647 0.0392 220.0000)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9843 0.0078 220.0000)',
      border: 'oklch(0.2549 0.0471 220.0000)',
      input: 'oklch(0.2549 0.0471 220.0000)',
      ring: 'oklch(0.6667 0.1569 220.0000)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
  },
};

// ============================================================================
// THEME 8: NORTHERN LIGHTS
// ============================================================================

const northernLightsTheme: TweakcnTheme = {
  id: 'northern-lights',
  name: 'Northern Lights',
  description: 'Aurora-inspired theme with Plus Jakarta Sans typography',
  category: 'auto',
  cssVars: {
    theme: {
      'font-sans': 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif',
      'font-mono': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-serif': 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      radius: '0.5rem',
      'tracking-tighter': '-0.05em',
      'tracking-tight': '-0.025em',
      'tracking-wide': '0.025em',
      'tracking-wider': '0.05em',
      'tracking-widest': '0.1em',
    },
    light: {
      background: 'oklch(0.9843 0.0078 300.0000)',
      foreground: 'oklch(0.1647 0.0392 300.0000)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.1647 0.0392 300.0000)',
      popover: 'oklch(1 0 0)',
      'popover-foreground': 'oklch(0.1647 0.0392 300.0000)',
      primary: 'oklch(0.5490 0.1804 300.0000)',
      'primary-foreground': 'oklch(0.9843 0.0078 300.0000)',
      secondary: 'oklch(0.9608 0.0157 300.0000)',
      'secondary-foreground': 'oklch(0.1647 0.0392 300.0000)',
      muted: 'oklch(0.9608 0.0157 300.0000)',
      'muted-foreground': 'oklch(0.5059 0.0941 300.0000)',
      accent: 'oklch(0.7765 0.1686 192.1771)',
      'accent-foreground': 'oklch(0.1647 0.0392 300.0000)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9843 0.0078 300.0000)',
      border: 'oklch(0.9216 0.0196 300.0000)',
      input: 'oklch(0.9216 0.0196 300.0000)',
      ring: 'oklch(0.5490 0.1804 300.0000)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
    dark: {
      background: 'oklch(0.1373 0.0314 300.0000)',
      foreground: 'oklch(0.9843 0.0078 300.0000)',
      card: 'oklch(0.1765 0.0392 300.0000)',
      'card-foreground': 'oklch(0.9843 0.0078 300.0000)',
      popover: 'oklch(0.1765 0.0392 300.0000)',
      'popover-foreground': 'oklch(0.9843 0.0078 300.0000)',
      primary: 'oklch(0.6667 0.2196 300.0000)',
      'primary-foreground': 'oklch(0.1647 0.0392 300.0000)',
      secondary: 'oklch(0.2549 0.0471 300.0000)',
      'secondary-foreground': 'oklch(0.9843 0.0078 300.0000)',
      muted: 'oklch(0.2549 0.0471 300.0000)',
      'muted-foreground': 'oklch(0.7255 0.0941 300.0000)',
      accent: 'oklch(0.7765 0.1686 192.1771)',
      'accent-foreground': 'oklch(0.1647 0.0392 300.0000)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9843 0.0078 300.0000)',
      border: 'oklch(0.2549 0.0471 300.0000)',
      input: 'oklch(0.2549 0.0471 300.0000)',
      ring: 'oklch(0.6667 0.2196 300.0000)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
  },
};

// ============================================================================
// THEME 9: RETRO ARCADE
// ============================================================================

const retroArcadeTheme: TweakcnTheme = {
  id: 'retro-arcade',
  name: 'Retro Arcade',
  description: 'Vibrant 80s-inspired theme with Outfit and Space Mono typography',
  category: 'auto',
  cssVars: {
    theme: {
      'font-sans': 'Outfit, ui-sans-serif, system-ui, sans-serif',
      'font-mono': 'Space Mono, ui-monospace, SFMono-Regular, monospace',
      'font-serif': 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      radius: '0.25rem',
      'tracking-tighter': '-0.05em',
      'tracking-tight': '-0.025em',
      'tracking-wide': '0.025em',
      'tracking-wider': '0.05em',
      'tracking-widest': '0.1em',
    },
    light: {
      background: 'oklch(0.9804 0.0118 330.0000)',
      foreground: 'oklch(0.1647 0.0392 330.0000)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.1647 0.0392 330.0000)',
      popover: 'oklch(1 0 0)',
      'popover-foreground': 'oklch(0.1647 0.0392 330.0000)',
      primary: 'oklch(0.6000 0.2549 330.0000)',
      'primary-foreground': 'oklch(0.9804 0.0118 330.0000)',
      secondary: 'oklch(0.9529 0.0235 330.0000)',
      'secondary-foreground': 'oklch(0.1647 0.0392 330.0000)',
      muted: 'oklch(0.9529 0.0235 330.0000)',
      'muted-foreground': 'oklch(0.5059 0.1255 330.0000)',
      accent: 'oklch(0.7843 0.2275 150.7159)',
      'accent-foreground': 'oklch(0.1647 0.0392 330.0000)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9804 0.0118 330.0000)',
      border: 'oklch(0.9098 0.0235 330.0000)',
      input: 'oklch(0.9098 0.0235 330.0000)',
      ring: 'oklch(0.6000 0.2549 330.0000)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
    dark: {
      background: 'oklch(0.1373 0.0392 330.0000)',
      foreground: 'oklch(0.9804 0.0118 330.0000)',
      card: 'oklch(0.1765 0.0471 330.0000)',
      'card-foreground': 'oklch(0.9804 0.0118 330.0000)',
      popover: 'oklch(0.1765 0.0471 330.0000)',
      'popover-foreground': 'oklch(0.9804 0.0118 330.0000)',
      primary: 'oklch(0.7294 0.2824 330.0000)',
      'primary-foreground': 'oklch(0.1647 0.0392 330.0000)',
      secondary: 'oklch(0.2549 0.0549 330.0000)',
      'secondary-foreground': 'oklch(0.9804 0.0118 330.0000)',
      muted: 'oklch(0.2549 0.0549 330.0000)',
      'muted-foreground': 'oklch(0.7255 0.1255 330.0000)',
      accent: 'oklch(0.7843 0.2275 150.7159)',
      'accent-foreground': 'oklch(0.1647 0.0392 330.0000)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(0.9804 0.0118 330.0000)',
      border: 'oklch(0.2549 0.0549 330.0000)',
      input: 'oklch(0.2549 0.0549 330.0000)',
      ring: 'oklch(0.7294 0.2824 330.0000)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
  },
};

// ============================================================================
// THEME 10: TWITTER
// ============================================================================

const twitterTheme: TweakcnTheme = {
  id: 'twitter',
  name: 'Twitter',
  description: 'Twitter-inspired theme with Open Sans and Georgia typography, rounded corners',
  category: 'auto',
  cssVars: {
    theme: {
      'font-sans': 'Open Sans, ui-sans-serif, system-ui, sans-serif',
      'font-mono': 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      'font-serif': 'Georgia, ui-serif, Cambria, "Times New Roman", Times, serif',
      radius: '1.3rem', // Extra rounded!
      'tracking-tighter': '-0.05em',
      'tracking-tight': '-0.025em',
      'tracking-wide': '0.025em',
      'tracking-wider': '0.05em',
      'tracking-widest': '0.1em',
    },
    light: {
      background: 'oklch(1 0 0)',
      foreground: 'oklch(0.1608 0.0196 264.0538)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.1608 0.0196 264.0538)',
      popover: 'oklch(1 0 0)',
      'popover-foreground': 'oklch(0.1608 0.0196 264.0538)',
      primary: 'oklch(0.5647 0.1922 239.2771)',
      'primary-foreground': 'oklch(1 0 0)',
      secondary: 'oklch(0.9647 0.0078 264.0538)',
      'secondary-foreground': 'oklch(0.1608 0.0196 264.0538)',
      muted: 'oklch(0.9647 0.0078 264.0538)',
      'muted-foreground': 'oklch(0.5020 0.0314 264.0538)',
      accent: 'oklch(0.9647 0.0078 264.0538)',
      'accent-foreground': 'oklch(0.1608 0.0196 264.0538)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(1 0 0)',
      border: 'oklch(0.9216 0.0157 264.0538)',
      input: 'oklch(0.9216 0.0157 264.0538)',
      ring: 'oklch(0.5647 0.1922 239.2771)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
    dark: {
      background: 'oklch(0.1608 0.0196 264.0538)',
      foreground: 'oklch(1 0 0)',
      card: 'oklch(0.2000 0.0235 264.0538)',
      'card-foreground': 'oklch(1 0 0)',
      popover: 'oklch(0.2000 0.0235 264.0538)',
      'popover-foreground': 'oklch(1 0 0)',
      primary: 'oklch(0.6784 0.2275 239.2771)',
      'primary-foreground': 'oklch(1 0 0)',
      secondary: 'oklch(0.2627 0.0314 264.0538)',
      'secondary-foreground': 'oklch(1 0 0)',
      muted: 'oklch(0.2627 0.0314 264.0538)',
      'muted-foreground': 'oklch(0.7176 0.0314 264.0538)',
      accent: 'oklch(0.2627 0.0314 264.0538)',
      'accent-foreground': 'oklch(1 0 0)',
      destructive: 'oklch(0.5765 0.2196 27.3251)',
      'destructive-foreground': 'oklch(1 0 0)',
      border: 'oklch(0.2627 0.0314 264.0538)',
      input: 'oklch(0.2627 0.0314 264.0538)',
      ring: 'oklch(0.6784 0.2275 239.2771)',
      'chart-1': 'oklch(0.6314 0.1373 150.7159)',
      'chart-2': 'oklch(0.7255 0.1686 192.1771)',
      'chart-3': 'oklch(0.7098 0.1255 78.9271)',
      'chart-4': 'oklch(0.7843 0.1608 52.5208)',
      'chart-5': 'oklch(0.6902 0.1294 17.3825)',
    },
  },
};

// ============================================================================
// THEME REGISTRY
// ============================================================================

/**
 * Array of all available themes (Complete: 10 themes)
 */
const themes: TweakcnTheme[] = [
  addLegacyProperties(supabaseTheme),
  addLegacyProperties(doom64Theme),
  addLegacyProperties(catppuccinTheme),
  addLegacyProperties(elegantLuxuryTheme),
  addLegacyProperties(tangerineTheme),
  addLegacyProperties(caffeineTheme),
  addLegacyProperties(oceanBreezeTheme),
  addLegacyProperties(northernLightsTheme),
  addLegacyProperties(retroArcadeTheme),
  addLegacyProperties(twitterTheme),
];

/**
 * Theme registry object for O(1) lookups by ID
 */
export const TWEAKCN_THEME_REGISTRY: ThemeRegistry = themes.reduce(
  (acc, theme) => {
    acc[theme.id] = theme;
    return acc;
  },
  {} as ThemeRegistry
);

/**
 * Get all available themes
 */
export function getAllThemes(): TweakcnTheme[] {
  return themes;
}

/**
 * Get a theme by ID
 * @param id - Theme identifier (e.g., 'supabase', 'doom-64')
 * @returns Theme object or undefined if not found
 */
export function getThemeById(id: string): TweakcnTheme | undefined {
  return TWEAKCN_THEME_REGISTRY[id];
}

/**
 * Get themes by category
 * @param category - 'light', 'dark', or 'auto'
 * @returns Array of themes matching the category
 */
export function getThemesByCategory(category: 'light' | 'dark' | 'auto'): TweakcnTheme[] {
  return themes.filter((theme) => theme.category === category);
}

/**
 * Get display name for a theme ID
 * @param id - Theme identifier
 * @returns Display name or 'Unknown Theme' if not found
 */
export function getThemeNameById(id: string): string {
  const theme = getThemeById(id);
  return theme?.name || 'Unknown Theme';
}

/**
 * Check if a theme ID is valid
 * @param id - Theme identifier to validate
 * @returns true if theme exists in registry
 */
export function isValidThemeId(id: string): boolean {
  return id in TWEAKCN_THEME_REGISTRY;
}

/**
 * Get total number of themes in registry
 */
export function getThemeCount(): number {
  return themes.length;
}

/**
 * Get default theme (fallback when no theme is specified)
 */
export function getDefaultTheme(): TweakcnTheme {
  return supabaseTheme; // Supabase as default for now
}

/**
 * Get themes grouped by category
 * @returns Themes grouped by 'light', 'dark', and 'auto' categories
 *
 * Note: For backward compatibility with VisualThemeSelector component.
 * Maps tweakcn categories to legacy structure.
 */
export function getThemesGroupedByCategory(): Record<string, TweakcnTheme[]> {
  return {
    // Map 'auto' to 'core' for legacy component compatibility
    core: themes.filter((t) => t.category === 'auto'),
    light: themes.filter((t) => t.category === 'light'),
    dark: themes.filter((t) => t.category === 'dark'),
  };
}
