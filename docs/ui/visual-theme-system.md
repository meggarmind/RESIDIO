# Visual Theme System (tweakcn Integration)

## Overview

The Residio Visual Theme System has been re-engineered to use [tweakcn.com](https://tweakcn.com) presets. This allows for high-quality, cohesive color schemes using the OKLCH color space, offering a more modern and vibrant aesthetic than the previous implementation.

## Features

- **10+ Pre-configured Themes**: Includes 'supabase', 'doom-64', 'midnight-bloom', and more.
- **Dynamic CSS Variables**: Themes apply CSS variables to `document.documentElement`, ensuring immediate UI updates without page reloads.
- **Dark Mode Support**: Each theme includes fully calibrated light and dark variants.
- **Font Integration**: Automatically loads and applies Google Fonts specified by the theme (e.g., Inter, JetBrains Mono, Playfair Display).
- **Legacy Compatibility**: Maps new semantic color tokens to legacy variable names (e.g., `--bill-mint`) to ensure older components continue to look correct.

## Architecture

### Core Files

- **Registry**: `src/lib/themes/tweakcn-registry.ts` - Central registry of all available theme definitions.
- **Types**: `src/types/theme.ts` - TypeScript definitions for the `TweakcnTheme` structure.
- **Provider**: `src/contexts/visual-theme-context.tsx` - enhanced `VisualThemeProvider` that manages theme state, loading, and CSS variable injection.
- **Fonts**: `src/lib/fonts.ts` - Utility to dynamically load fonts from Google Fonts.

### State Management

- **Persistence**: Theme selection is saved to `sessionStorage` for immediate restoration on reload.
- **User Preference**: Authenticated users have their theme preference stored in the `profiles` table.
- **System Default**: Fallback to 'supabase' theme if no preference is set.

## Adding a New Theme

1. Generate a theme on [tweakcn.com](https://tweakcn.com).
2. Copy the JSON output.
3. Add the theme object to `src/lib/themes/tweakcn-registry.ts`.
4. The theme will automatically appear in the Theme Picker.

## Usage

The theme system is global. To access theme data in a component:

```tsx
import { useVisualTheme } from '@/contexts/visual-theme-context';

export function MyComponent() {
  const { theme, setThemeId } = useVisualTheme();
  
  return (
    <div>
      <p>Current Theme: {theme.name}</p>
      <button onClick={() => setThemeId('zinc')}>Set Zinc</button>
    </div>
  );
}
```
