# Card Component System

To ensure UI consistency across the Residio application, we use a standardized card variant system powered by `class-variance-authority` (CVA).

## Overview

The standard `Card` component located at `src/components/ui/card.tsx` has been enhanced with a `variant` prop and an `interactive` boolean flag. This replaces ad-hoc padding and shadow classes previously scattered throughout the codebase.

## Variants

| Variant | Usage | Padding |
|---------|-------|---------|
| `default` | Standard forms, settings, and general containers | `py-6` |
| `stat` | KPI and metric cards (Dashboard) | `py-4` |
| `list` | Scrollable lists (Recent Activity, Quick Stats) | `py-0` |
| `featured`| Hero sections or featured content | `py-4` |
| `compact` | Dense grids (Document cards, small items) | `py-3` |

## Interactive Cards

By setting the `interactive` prop to `true`, the card gains hover effects, transitions, and a pointer cursor. This is ideal for cards that link to detail pages or trigger actions.

```tsx
<Card variant="compact" interactive>
  <CardHeader>
    <CardTitle>Document Title</CardTitle>
  </CardHeader>
  <CardContent>
    Click to view details
  </CardContent>
</Card>
```

## CSS Variables & Implementation

The card system leverages the global theme's CSS variables for background colors, borders, and shadows, ensuring that cards automatically adapt when switching between the **Default** and **Modern** themes.

- **Background**: `var(--card)`
- **Border**: `var(--border)`
- **Shadow**: Standardized classes (e.g., `shadow-sm`, `hover:shadow-md`)
