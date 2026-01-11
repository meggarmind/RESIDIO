# Theme Picker Live Preview Implementation Guide

## Overview

Enhance the Profile Appearance theme picker to provide live preview functionality matching the onboarding theme selection experience. Users should be able to hover over theme options and see the entire interface update in real-time.

## Current Behavior

**Profile Appearance Settings** (`src/app/(resident)/portal/profile/page.tsx` or similar):
- Shows grid of theme options with color swatches
- Clicking selects a theme
- No live preview on hover
- Must navigate away to see theme effect

**Onboarding Theme Picker** (Reference):
- Hover shows immediate preview
- Entire interface updates
- Preview includes sidebar, cards, buttons, text colors
- Reverts to current theme when hover ends

## Implementation Pattern

### 1. Use Existing Hook

The `useVisualTheme` hook already supports preview functionality:

```typescript
import { useVisualTheme } from '@/contexts/visual-theme-context';

function ThemePicker() {
  const { themeId, setThemeId, previewThemeId, setPreviewThemeId } = useVisualTheme();

  // previewThemeId: For temporary hover previews
  // themeId: For permanent selection
}
```

### 2. Theme Grid Component

```tsx
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { getAvailableThemes, getThemesGroupedByCategory } from '@/lib/themes/registry';

interface ThemePickerProps {
  onThemeSelect?: (themeId: string) => void;
}

export function ThemePickerWithPreview({ onThemeSelect }: ThemePickerProps) {
  const { themeId, setThemeId, setPreviewThemeId } = useVisualTheme();
  const themesGrouped = getThemesGroupedByCategory();

  const handleThemeClick = (id: string) => {
    setThemeId(id);
    setPreviewThemeId(null); // Clear preview
    onThemeSelect?.(id);
  };

  const handleThemeHover = (id: string) => {
    setPreviewThemeId(id);
  };

  const handleThemeLeave = () => {
    setPreviewThemeId(null);
  };

  return (
    <div className="space-y-8">
      {Object.entries(themesGrouped).map(([category, themes]) => (
        <div key={category}>
          <h3
            className="text-sm font-semibold uppercase tracking-wider mb-4"
            style={{ color: 'var(--text-muted)' }}
          >
            {category} Themes
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {themes.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                isActive={themeId === theme.id}
                onClick={() => handleThemeClick(theme.id)}
                onMouseEnter={() => handleThemeHover(theme.id)}
                onMouseLeave={handleThemeLeave}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 3. Theme Card Component

```tsx
import { VisualTheme } from '@/lib/themes/types';
import { Check } from 'lucide-react';
import { useTheme } from 'next-themes';

interface ThemeCardProps {
  theme: VisualTheme;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ThemeCard({
  theme,
  isActive,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: ThemeCardProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const colors = isDark ? theme.dark : theme.light;

  return (
    <button
      type="button"
      className="relative group cursor-pointer transition-all duration-200"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: `2px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        padding: '1rem',
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-label={`Select ${theme.name} theme`}
      aria-pressed={isActive}
    >
      {/* Active indicator */}
      {isActive && (
        <div
          className="absolute top-2 right-2 rounded-full p-1"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--text-on-accent)',
          }}
        >
          <Check className="h-3 w-3" />
        </div>
      )}

      {/* Theme name */}
      <div className="mb-3">
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {theme.name}
        </p>
        <p
          className="text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          {theme.description}
        </p>
      </div>

      {/* Color palette preview */}
      <div className="flex gap-1">
        <div
          className="h-8 flex-1 rounded"
          style={{ backgroundColor: colors.accent.primary }}
          title="Primary accent"
        />
        <div
          className="h-8 flex-1 rounded"
          style={{ backgroundColor: colors.accent.secondary }}
          title="Secondary accent"
        />
        <div
          className="h-8 flex-1 rounded"
          style={{ backgroundColor: colors.accent.tertiary }}
          title="Tertiary accent"
        />
      </div>

      {/* Hover overlay */}
      <div
        className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{
          border: '2px solid var(--accent-primary)',
        }}
      />
    </button>
  );
}
```

### 4. Integration with Profile Page

Update the existing Profile Appearance section:

```tsx
// src/app/(resident)/portal/profile/page.tsx (or settings/appearance)

import { ThemePickerWithPreview } from '@/components/settings/theme-picker-with-preview';

export default function ProfileAppearancePage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 style={{ color: 'var(--text-primary)' }}>Appearance Preferences</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Customize the look and feel of your portal. Hover over themes to preview them instantly.
        </p>
      </div>

      {/* Light/Dark mode toggle */}
      <div>
        <h3>Color Mode</h3>
        <ThemeSwitcher />
      </div>

      {/* Theme picker with live preview */}
      <div>
        <h3>Visual Theme</h3>
        <ThemePickerWithPreview
          onThemeSelect={(themeId) => {
            // Optional: Save to user preferences
            // await updateUserThemePreference(themeId);
          }}
        />
      </div>
    </div>
  );
}
```

## How It Works

### Preview Flow

1. **User hovers** over theme card
2. `setPreviewThemeId(id)` called
3. `VisualThemeProvider` detects preview ID
4. CSS variables update to preview theme
5. **Entire interface updates** (sidebar, cards, text, borders)
6. User moves away
7. `setPreviewThemeId(null)` called
8. CSS variables revert to permanent theme

### State Management

```typescript
// In VisualThemeProvider
const activeThemeId = previewThemeId || themeId;
const theme = useMemo(() => {
  const foundTheme = getThemeById(activeThemeId);
  return foundTheme || getDefaultTheme();
}, [activeThemeId]);
```

**Key Points:**
- Preview doesn't persist
- Preview overrides current theme temporarily
- Clicking makes preview permanent
- No database writes until selection confirmed

## Visual Feedback

### Hover State
- Border highlights with accent color
- Card slightly scales up (optional)
- Smooth transition (200ms)

### Active State
- Checkmark indicator
- Accent-colored border
- No hover effects (prevent confusion)

### Preview State
- Entire application updates
- Includes:
  - Sidebar colors
  - Card backgrounds
  - Text colors (primary, secondary, muted)
  - Border colors
  - Accent highlights
  - Status colors
  - Button colors

## Performance Considerations

### Optimizations
- Theme objects memoized
- CSS variable updates (no re-renders)
- Debounce hover events (optional)
- Lazy load theme definitions

### Smooth Transitions
```css
/* In globals.css */
:root {
  transition: background-color 200ms ease,
              color 200ms ease,
              border-color 200ms ease;
}
```

## Accessibility

### Keyboard Navigation
- Tab through theme cards
- Enter/Space to select
- Arrow keys to navigate grid (optional)
- Escape to cancel preview

### Screen Readers
- Announce theme name on focus
- Announce "Selected" for active theme
- Announce "Preview" during hover
- Group themes by category with headings

### Focus Management
```tsx
<button
  aria-label={`Select ${theme.name} theme`}
  aria-pressed={isActive}
  onFocus={onMouseEnter}  // Preview on focus too
  onBlur={onMouseLeave}
>
```

## Mobile Considerations

### Touch Devices
- Tap to select (no preview)
- OR: First tap previews, second tap selects
- Long press for preview (advanced)

### Responsive Grid
```tsx
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
```

## Testing Checklist

- [ ] Hover shows instant preview
- [ ] Preview reverts when hover ends
- [ ] Click persists theme selection
- [ ] Active theme has visual indicator
- [ ] Preview works with light/dark mode
- [ ] Keyboard navigation works
- [ ] Screen readers announce properly
- [ ] Mobile tap-to-select works
- [ ] Transitions are smooth
- [ ] No flashing/flickering
- [ ] Performance acceptable (31 themes)

## Implementation Steps

1. **Create ThemeCard component** with hover handlers
2. **Create ThemePickerWithPreview component** with grid layout
3. **Update Profile/Settings page** to use new picker
4. **Test with all themes** (31 total)
5. **Verify accessibility**
6. **Test on mobile devices**
7. **Document user-facing feature**

## Example: Onboarding Reference

The onboarding theme picker already implements this pattern. Reference:
- `src/app/(resident)/portal/onboarding/page.tsx`
- Look for `setPreviewThemeId` usage
- Copy hover handler patterns
- Adapt layout for settings page

## Comparison

| Feature | Onboarding | Profile (After) |
|---------|-----------|----------------|
| Layout | Horizontal carousel | Grid layout |
| Categories | Mixed display | Grouped by category |
| Preview | ✅ Hover preview | ✅ Hover preview |
| Persistence | Session only | Saved to profile |
| Mobile | Swipe gestures | Tap-to-select |

## Alternative Implementations

### Option 1: Modal Preview (Complex)
- Open full-screen modal
- Show theme applied to sample UI
- More control but less intuitive

### Option 2: Split Screen (Advanced)
- Left: Theme picker
- Right: Live preview of portal
- Good for power users

### Option 3: Current + Simple Hover (Recommended)
- Grid of themes
- Hover for instant preview
- Matches onboarding UX
- Most intuitive

## Rollout Plan

1. **Phase 1**: Implement basic hover preview
2. **Phase 2**: Add keyboard navigation
3. **Phase 3**: Optimize mobile experience
4. **Phase 4**: Add theme search/filter (if 31 themes is too many)

## Related Documentation

- [Comprehensive Theme System](../themes/README.md)
- [Visual Theme Context](../../src/contexts/visual-theme-context.tsx)
- [Theme Registry](../../src/lib/themes/registry.ts)
- [Portal Theme Migration](portal-theme-migration-guide.md)
