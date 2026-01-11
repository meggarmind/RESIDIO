# Comprehensive Theme CSS Variable System

## Overview

Residio uses a comprehensive theming system that provides CSS variables for all visual elements across the application. This ensures consistent, theme-aware styling for backgrounds, text, borders, interactive states, inputs, and overlays.

## CSS Variable Categories

### 1. Background Colors
- `--bg-primary`: Primary page background
- `--bg-secondary`: Secondary background for sections
- `--bg-card`: Card background
- `--bg-sidebar`: Sidebar background
- `--bg-elevated`: Elevated surfaces (modals, dropdowns)
- `--bg-hover`: Hover state background
- `--bg-active`: Active/pressed state background

### 2. Text Colors
- `--text-primary`: Primary text for headings and important content
- `--text-secondary`: Secondary text for body content
- `--text-muted`: Muted text for captions and less important content
- `--text-disabled`: Disabled text
- `--text-on-accent`: Text on colored backgrounds (ensures contrast)

### 3. Accent Colors
- `--accent-primary`: Primary accent for main interactive elements
- `--accent-secondary`: Secondary accent for complementary actions
- `--accent-tertiary`: Tertiary accent for subtle highlights
- `--accent-hover`: Hover state for accent elements
- `--accent-active`: Active/pressed state for accent elements

### 4. Status Colors
- `--status-success` / `--status-success-subtle`: Success states
- `--status-warning` / `--status-warning-subtle`: Warning states
- `--status-error` / `--status-error-subtle`: Error states
- `--status-info` / `--status-info-subtle`: Info states

### 5. Border Colors
- `--border-default`: Default border color
- `--border-subtle`: Subtle border for low-emphasis divisions
- `--border-focus`: Focus ring color for accessibility
- `--border-hover`: Hover state border

### 6. Interactive States
- `--interactive-default`: Default button/link background
- `--interactive-hover`: Hover state
- `--interactive-active`: Active/pressed state
- `--interactive-disabled`: Disabled state
- `--interactive-focus`: Focus ring

### 7. Input States
- `--input-bg`: Default input background
- `--input-border`: Input border
- `--input-border-hover`: Input border on hover
- `--input-border-focus`: Input border on focus
- `--input-placeholder`: Placeholder text
- `--input-bg-disabled`: Disabled input background

### 8. Overlay Colors
- `--overlay-backdrop`: Modal backdrop
- `--overlay-tooltip`: Tooltip background
- `--overlay-popover`: Popover background

## Usage Examples

### Using Theme Variables in Components

```tsx
// Card with theme-aware styling
<div style={{
  backgroundColor: 'var(--bg-card)',
  borderColor: 'var(--border-default)',
  color: 'var(--text-primary)'
}}>
  <h2 style={{ color: 'var(--text-primary)' }}>Title</h2>
  <p style={{ color: 'var(--text-secondary)' }}>Description</p>
</div>

// Button with interactive states
<button style={{
  backgroundColor: 'var(--accent-primary)',
  color: 'var(--text-on-accent)'
}}
onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
>
  Click me
</button>

// Input with focus states
<input style={{
  backgroundColor: 'var(--input-bg)',
  borderColor: 'var(--input-border)',
  color: 'var(--text-primary)'
}}
onFocus={(e) => e.currentTarget.style.borderColor = 'var(--input-border-focus)'}
/>
```

### Using with Tailwind CSS

Add these to your `tailwind.config.ts`:

```ts
extend: {
  colors: {
    theme: {
      'bg-primary': 'var(--bg-primary)',
      'bg-card': 'var(--bg-card)',
      'text-primary': 'var(--text-primary)',
      'accent-primary': 'var(--accent-primary)',
      // ... add more as needed
    }
  }
}
```

Then use in components:

```tsx
<div className="bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)]">
  Content
</div>
```

## Creating a New Theme

When creating a new theme, ensure you provide values for all color categories:

```typescript
import type { VisualTheme } from './types';

export const myCustomTheme: VisualTheme = {
  id: 'my-theme',
  name: 'My Theme',
  description: 'Description of my theme',
  category: 'light', // or 'dark' or 'core'

  light: {
    bg: {
      primary: '#FFFFFF',
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
      primary: '#3B82F6',
      secondary: '#8B5CF6',
      tertiary: '#06B6D4',
      hover: '#2563EB',
      active: '#1D4ED8',
    },
    status: {
      success: '#10B981',
      successSubtle: '#D1FAE5',
      warning: '#F59E0B',
      warningSubtle: '#FEF3C7',
      error: '#EF4444',
      errorSubtle: '#FEE2E2',
      info: '#3B82F6',
      infoSubtle: '#DBEAFE',
    },
    border: {
      default: '#E5E7EB',
      subtle: '#F3F4F6',
      focus: '#3B82F6',
      hover: '#D1D5DB',
    },
    interactive: {
      default: '#F9FAFB',
      hover: '#F3F4F6',
      active: '#E5E7EB',
      disabled: '#F9FAFB',
      focus: '#3B82F6',
    },
    input: {
      bg: '#FFFFFF',
      border: '#D1D5DB',
      borderHover: '#9CA3AF',
      borderFocus: '#3B82F6',
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
    // Similar structure for dark mode
    // ...
  },

  typography: { /* ... */ },
  spacing: { /* ... */ },
  borderRadius: { /* ... */ },
  shadows: { /* ... */ },
  chart: { /* ... */ },
};
```

## Migration from Legacy Variables

### Legacy to New Mapping

| Legacy Variable | New Variable |
|----------------|--------------|
| `--bill-mint` | `--accent-primary` |
| `--bill-lavender` | `--accent-secondary` |
| `--bill-teal` | `--accent-tertiary` |
| `--bill-success` | `--status-success` |
| `--bill-orange` | `--status-warning` |
| `--bill-coral` | `--status-error` |

**Note**: Legacy variables are still supported for backwards compatibility but should be migrated to new variable names.

## Theme Contexts

Themes are applied per context:
- **Admin Dashboard**: `context="admin-dashboard"`
- **Resident Portal**: `context="resident-portal"`

Each context can have its own theme selection.

## Best Practices

1. **Always use CSS variables** instead of hardcoded colors
2. **Use semantic names** - prefer `--text-primary` over specific color values
3. **Consider color mode** - ensure sufficient contrast in both light and dark modes
4. **Test interactive states** - verify hover, focus, and active states work correctly
5. **Maintain consistency** - use the same variables for similar UI elements across the app

## Accessibility

- Focus rings use `--border-focus` for keyboard navigation visibility
- Text on accent backgrounds uses `--text-on-accent` to ensure sufficient contrast
- Status colors have subtle variants for background highlighting
- Disabled states use `--text-disabled` and `--interactive-disabled` for clear visual feedback
