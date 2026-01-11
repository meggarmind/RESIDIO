# Sidebar Expand/Collapse Feature

## Overview

The admin dashboard sidebar now supports expand/collapse functionality with full theme compliance. Users can toggle between a compact icon-only view and a full-width view with labels.

## Features

### 1. Toggle Functionality
- **Toggle Button**: Click the chevron icon in the sidebar header to expand/collapse
- **Persistent State**: Sidebar state is saved to localStorage and restored on page reload
- **Keyboard Accessible**: Toggle button has proper aria-label for screen readers

### 2. Hover Expansion
- **Temporary Expansion**: When collapsed, hover over the sidebar to temporarily expand it
- **Smooth Animation**: Transitions smoothly between states (300ms duration)
- **Auto-collapse**: Sidebar collapses back when mouse leaves the area

### 3. Responsive Widths
- **Collapsed**: 64px (4rem) - Shows icons only
- **Expanded**: 256px (16rem) - Shows icons + text

### 4. Theme Compliance
All colors and interactive states use CSS variables from the comprehensive theme system:

| Element | CSS Variable |
|---------|-------------|
| Background | `var(--bg-card)` |
| Border | `var(--border-default)` |
| Text (default) | `var(--text-secondary)` |
| Text (hover) | `var(--text-primary)` |
| Text (active) | `var(--text-on-accent)` |
| Active background | `var(--accent-primary)` |
| Hover background | `var(--bg-hover)` |

## Implementation Details

### Hook: `useSidebarState`

Location: `src/hooks/use-sidebar-state.ts`

```typescript
interface UseSidebarStateResult {
  isCollapsed: boolean;      // Permanent collapsed state
  isHoverExpanded: boolean;  // Temporary hover expansion
  toggleCollapsed: () => void;
  setHoverExpanded: (expanded: boolean) => void;
  isExpanded: boolean;       // Computed: !isCollapsed || isHoverExpanded
}
```

**Features:**
- Manages sidebar state with useState
- Persists state to localStorage (`residio-sidebar-collapsed`)
- Provides computed `isExpanded` for rendering logic
- Handles hover expansion separately from permanent state

### Component Updates

Location: `src/components/dashboard/sidebar.tsx`

**Key Changes:**
1. Import `useSidebarState` hook
2. Import `ChevronLeft`, `ChevronRight` icons for toggle button
3. Import `Tooltip` components for collapsed state labels
4. Conditional rendering based on `isExpanded` state
5. Hover handlers for temporary expansion
6. Theme CSS variables for all colors

**Conditional Rendering:**

```tsx
// Width changes based on state
className={cn(
  'flex flex-col border-r transition-all duration-300',
  isCollapsed ? 'w-16' : 'w-64'
)}

// Text only shows when expanded
{isExpanded && <span>{item.title}</span>}

// Tooltips in collapsed state
{isCollapsed && !isExpanded ? (
  <Tooltip>
    <TooltipTrigger>{navLink}</TooltipTrigger>
    <TooltipContent>{item.title}</TooltipContent>
  </Tooltip>
) : (
  navLink
)}
```

## User Experience

### Expanded State (Default)
- Full navigation labels visible
- Section headers shown
- User profile with name and role
- Theme switcher visible
- Toggle button shows left chevron

### Collapsed State
- Icons only, center-aligned
- No section headers
- Tooltips appear on hover
- User initials only
- Theme switcher hidden
- Toggle button shows right chevron

### Hover Expansion (when collapsed)
- Sidebar temporarily expands to full width
- All text becomes visible
- Toggle button appears
- Returns to collapsed when mouse leaves

## Accessibility

### Keyboard Navigation
- All navigation items remain keyboard accessible
- Toggle button has descriptive aria-label
- Tooltips provide context for icon-only items

### Screen Readers
- Tooltips announce item names when focused
- Toggle button announces current state
- Profile section provides full information

### Focus Management
- Focus indicators use theme variables
- Hover states don't interfere with focus states
- All interactive elements have proper focus outlines

## Testing Checklist

- [ ] Toggle button expands/collapses sidebar
- [ ] State persists after page reload
- [ ] Hover expands collapsed sidebar temporarily
- [ ] Tooltips appear in collapsed state
- [ ] All navigation items remain clickable
- [ ] Active state styling works in both modes
- [ ] Theme changes apply correctly
- [ ] Text is readable in light and dark themes
- [ ] Smooth animations (no janky transitions)
- [ ] Profile section adapts to collapsed state

## Browser Compatibility

- **Modern Browsers**: Full support (Chrome, Firefox, Safari, Edge)
- **CSS Variables**: Required (IE11 not supported)
- **localStorage**: Falls back gracefully if unavailable
- **Hover**: Works on all devices with pointing devices

## Performance

- **localStorage Access**: Minimal (mount + state changes only)
- **Re-renders**: Optimized with memoized hook
- **Animations**: Hardware-accelerated (transform/opacity)
- **Tooltips**: Zero-delay for instant feedback

## Future Enhancements

Possible improvements for future iterations:

1. **Mobile Behavior**: Different collapse logic for mobile devices
2. **Animation Preferences**: Respect prefers-reduced-motion
3. **Custom Widths**: Allow user to configure sidebar widths
4. **Pinned Items**: Keep certain items always visible
5. **Search**: Quick search when collapsed
6. **Keyboard Shortcut**: Toggle sidebar with keyboard (e.g., Ctrl+B)

## Related Files

- **Hook**: `src/hooks/use-sidebar-state.ts`
- **Component**: `src/components/dashboard/sidebar.tsx`
- **Theme Variables**: `src/lib/themes/types.ts`
- **Theme Provider**: `src/contexts/visual-theme-context.tsx`

## Migration Notes

This feature is backwards compatible. Existing users will see the expanded sidebar by default. The collapsed state is opt-in via the toggle button.

No database migrations required. State is stored client-side only.
