# Icon Theming Guide

## Current Implementation

Residio uses **Lucide React** for all icons, which are SVG-based and fully theme-aware.

## Icon Styling Methods

### Method 1: Tailwind Theme Classes (Current)

```tsx
<Home className="text-muted-foreground hover:text-accent-foreground" />
```

**Pros:**
- Concise syntax
- Automatic theme support via Tailwind
- Hover states via CSS classes

**Cons:**
- Limited to Tailwind's predefined color tokens
- Less granular control

### Method 2: CSS Variables (New, Recommended)

```tsx
<Home style={{ color: 'var(--text-primary)' }} />
<Home className="text-[var(--accent-primary)]" />
```

**Pros:**
- Direct access to comprehensive theme system
- More granular control (hover, focus, active, disabled states)
- Consistent with comprehensive theme variable system (DEV-116)

**Cons:**
- Slightly more verbose
- Requires inline styles or arbitrary Tailwind values

### Method 3: Hybrid Approach (Best)

Use Tailwind classes for simple cases, CSS variables for complex states:

```tsx
// Simple: Tailwind class
<Home className="text-primary" />

// Complex: CSS variables for granular control
<button
  className="flex items-center gap-2"
  style={{
    color: 'var(--text-secondary)',
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.color = 'var(--text-primary)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.color = 'var(--text-secondary)';
  }}
>
  <Settings />
  <span>Settings</span>
</button>

// Or using CSS classes:
.nav-icon {
  color: var(--text-secondary);
}

.nav-icon:hover {
  color: var(--accent-primary);
}

.nav-icon:active {
  color: var(--accent-active);
}

.nav-icon:disabled {
  color: var(--text-disabled);
}
```

## Icon Color Guidelines

### Navigation Icons

| State | CSS Variable | Tailwind Equivalent |
|-------|-------------|-------------------|
| Default | `var(--text-secondary)` | `text-muted-foreground` |
| Hover | `var(--text-primary)` | `hover:text-foreground` |
| Active | `var(--accent-primary)` | `text-primary` |
| Disabled | `var(--text-disabled)` | `text-muted` |

### Status Icons

| Type | CSS Variable | Color |
|------|-------------|-------|
| Success | `var(--status-success)` | Green |
| Warning | `var(--status-warning)` | Orange/Amber |
| Error | `var(--status-error)` | Red |
| Info | `var(--status-info)` | Blue |

### Interactive Icons (Buttons)

```tsx
// Button icon with comprehensive states
<button
  className="icon-button"
  disabled={isDisabled}
>
  <Trash2 />
</button>

/* CSS */
.icon-button {
  color: var(--interactive-default);
}

.icon-button:hover:not(:disabled) {
  color: var(--interactive-hover);
}

.icon-button:active:not(:disabled) {
  color: var(--interactive-active);
}

.icon-button:focus-visible {
  outline: 2px solid var(--interactive-focus);
}

.icon-button:disabled {
  color: var(--interactive-disabled);
  cursor: not-allowed;
}
```

## Common Icon Patterns

### 1. Navigation Item

```tsx
<Link
  href={item.href}
  className={cn(
    'flex items-center gap-3 px-3 py-2 rounded-lg',
    isActive
      ? 'bg-[var(--accent-primary)] text-[var(--text-on-accent)]'
      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
  )}
>
  <item.icon className="h-4 w-4" />
  <span>{item.title}</span>
</Link>
```

### 2. Status Indicator

```tsx
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success':
      return <Check className="h-4 w-4" style={{ color: 'var(--status-success)' }} />;
    case 'error':
      return <X className="h-4 w-4" style={{ color: 'var(--status-error)' }} />;
    case 'warning':
      return <AlertCircle className="h-4 w-4" style={{ color: 'var(--status-warning)' }} />;
    default:
      return <Info className="h-4 w-4" style={{ color: 'var(--status-info)' }} />;
  }
};
```

### 3. Card Icon with Background

```tsx
<div
  className="p-3 rounded-lg"
  style={{
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--accent-primary)'
  }}
>
  <Wallet className="h-6 w-6" />
</div>
```

### 4. Icon Button with All States

```tsx
<button
  className="p-2 rounded-lg transition-colors"
  style={{
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--interactive-default)',
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.backgroundColor = 'var(--interactive-hover)';
    e.currentTarget.style.color = 'var(--text-primary)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.backgroundColor = 'var(--interactive-default)';
    e.currentTarget.style.color = 'var(--text-secondary)';
  }}
  onMouseDown={(e) => {
    e.currentTarget.style.backgroundColor = 'var(--interactive-active)';
  }}
  onFocus={(e) => {
    e.currentTarget.style.outline = `2px solid var(--interactive-focus)`;
  }}
  onBlur={(e) => {
    e.currentTarget.style.outline = 'none';
  }}
>
  <Settings className="h-5 w-5" />
</button>
```

## Available Lucide Icons

Common icons used in Residio:

### Navigation
- `Home` - Dashboard
- `Users` - Residents
- `Building2` - Houses/Properties
- `CreditCard` - Payments
- `Receipt` - Invoices
- `Wallet` - Wallet
- `Shield` - Security
- `Settings` - Settings

### Actions
- `Plus` - Add/Create
- `Edit` - Edit
- `Trash2` - Delete
- `Search` - Search
- `Filter` - Filter
- `Download` - Download
- `Upload` - Upload
- `Send` - Send/Submit

### Status & Feedback
- `Check` / `CheckCircle` - Success
- `X` / `XCircle` - Error
- `AlertCircle` - Warning
- `Info` - Information
- `AlertTriangle` - Alert

### UI Elements
- `ChevronDown` - Dropdown
- `ChevronRight` - Next/Expand
- `Menu` - Mobile menu
- `MoreVertical` - Options menu

### Trends & Data
- `ArrowUp` - Increase
- `ArrowDown` - Decrease
- `TrendingUp` - Positive trend
- `TrendingDown` - Negative trend
- `BarChart3` - Analytics

## Migration Path

### Phase 1: Keep Current Implementation ✓
- Lucide icons already in use
- Tailwind classes provide theme support
- No immediate action needed

### Phase 2: Gradual Enhancement (Optional)
- Replace Tailwind color classes with CSS variables in new components
- Update existing components during feature work
- Focus on components with complex interactive states

### Phase 3: Future Optimization (When needed)
- Create reusable icon wrapper components with built-in theme support
- Standardize icon sizing and spacing
- Add icon animation utilities

## Example: Icon Wrapper Component

```tsx
// src/components/ui/themed-icon.tsx
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemedIconProps {
  icon: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
  className?: string;
}

export function ThemedIcon({
  icon: Icon,
  size = 'md',
  variant = 'default',
  className
}: ThemedIconProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const colorVars = {
    default: 'var(--text-secondary)',
    primary: 'var(--accent-primary)',
    success: 'var(--status-success)',
    warning: 'var(--status-warning)',
    error: 'var(--status-error)',
  };

  return (
    <Icon
      className={cn(sizeClasses[size], className)}
      style={{ color: colorVars[variant] }}
    />
  );
}

// Usage:
<ThemedIcon icon={Home} size="md" variant="primary" />
```

## Accessibility

### Always provide context for icon-only buttons:

```tsx
// Bad
<button><X /></button>

// Good
<button aria-label="Close dialog">
  <X />
</button>

// Better
<button>
  <X />
  <span className="sr-only">Close dialog</span>
</button>
```

### Use tooltips for icon-only navigation:

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Link href="/dashboard" aria-label="Dashboard">
        <Home />
      </Link>
    </TooltipTrigger>
    <TooltipContent>Dashboard</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

## Testing Icon Themes

To verify icons respond to theme changes:

1. Navigate to a page with icons
2. Switch between light/dark modes
3. Change visual themes in settings
4. Verify icons change color appropriately
5. Test hover/focus/active states
6. Check disabled states

## Resources

- [Lucide Icons Library](https://lucide.dev/icons/)
- [Theme CSS Variables](../themes/README.md)
- [Tailwind Theme Configuration](https://tailwindcss.com/docs/theme)
