# Resident Portal Theme Variable Migration Guide

## Overview

This guide provides patterns for migrating the Resident Portal pages (Invoices, Wallet, Properties) to use the comprehensive theme CSS variable system established in DEV-116.

## Current Issues

The portal pages currently use:
1. Hardcoded Tailwind color classes (e.g., `text-red-600`, `bg-emerald-500/10`)
2. Dark mode variants (`dark:text-red-400`)
3. Fixed gradient colors
4. Static border colors

These don't respond to theme changes beyond light/dark mode.

## Migration Patterns

### 1. Status Colors

**Before:**
```tsx
// Status badge with hardcoded colors
const statusConfig = {
  unpaid: { color: 'text-amber-600 bg-amber-500/10' },
  paid: { color: 'text-emerald-600 bg-emerald-500/10' },
  overdue: { color: 'text-red-600 bg-red-500/10' },
};
```

**After:**
```tsx
// Use CSS variables for theme-aware status colors
<Badge
  style={{
    color: 'var(--status-warning)',
    backgroundColor: 'var(--status-warning-subtle)',
  }}
>
  Unpaid
</Badge>

<Badge
  style={{
    color: 'var(--status-success)',
    backgroundColor: 'var(--status-success-subtle)',
  }}
>
  Paid
</Badge>

<Badge
  style={{
    color: 'var(--status-error)',
    backgroundColor: 'var(--status-error-subtle)',
  }}
>
  Overdue
</Badge>
```

### 2. Summary Cards with Gradients

**Before:**
```tsx
<Card className="bg-gradient-to-br from-red-500/10 to-orange-500/5 border-red-500/20">
  <p className="text-xl font-bold text-red-600 dark:text-red-400">
    {formatCurrency(totalOutstanding)}
  </p>
</Card>
```

**After:**
```tsx
<Card
  style={{
    background: `linear-gradient(to bottom right,
      var(--status-error-subtle),
      transparent)`,
    borderColor: 'var(--status-error)',
  }}
>
  <p
    className="text-xl font-bold"
    style={{ color: 'var(--status-error)' }}
  >
    {formatCurrency(totalOutstanding)}
  </p>
</Card>
```

### 3. Text Colors

**Before:**
```tsx
<p className="text-muted-foreground">Label</p>
<p className="text-red-600 dark:text-red-400">Error</p>
```

**After:**
```tsx
<p style={{ color: 'var(--text-muted)' }}>Label</p>
<p style={{ color: 'var(--status-error)' }}>Error</p>
```

### 4. Interactive Elements

**Before:**
```tsx
<Card className="cursor-pointer hover:border-primary/30">
  {/* content */}
</Card>
```

**After:**
```tsx
<Card
  className="cursor-pointer transition-colors"
  style={{
    borderColor: 'var(--border-default)',
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.borderColor = 'var(--border-hover)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.borderColor = 'var(--border-default)';
  }}
>
  {/* content */}
</Card>
```

### 5. Backgrounds

**Before:**
```tsx
<div className="bg-muted">Content</div>
<div className="bg-card">Content</div>
```

**After:**
```tsx
<div style={{ backgroundColor: 'var(--bg-secondary)' }}>Content</div>
<div style={{ backgroundColor: 'var(--bg-card)' }}>Content</div>
```

## Color Mapping Reference

### Status Colors

| Old Tailwind Class | New CSS Variable | Usage |
|-------------------|------------------|-------|
| `text-red-600` | `var(--status-error)` | Error text |
| `bg-red-500/10` | `var(--status-error-subtle)` | Error background |
| `text-emerald-600` | `var(--status-success)` | Success text |
| `bg-emerald-500/10` | `var(--status-success-subtle)` | Success background |
| `text-amber-600` | `var(--status-warning)` | Warning text |
| `bg-amber-500/10` | `var(--status-warning-subtle)` | Warning background |
| `text-blue-600` | `var(--status-info)` | Info text |
| `bg-blue-500/10` | `var(--status-info-subtle)` | Info background |

### Text Colors

| Old Tailwind Class | New CSS Variable |
|-------------------|------------------|
| `text-foreground` | `var(--text-primary)` |
| `text-muted-foreground` | `var(--text-secondary)` |
| `text-muted-foreground/50` | `var(--text-muted)` |
| `text-gray-400` | `var(--text-disabled)` |

### Background Colors

| Old Tailwind Class | New CSS Variable |
|-------------------|------------------|
| `bg-background` | `var(--bg-primary)` |
| `bg-muted` | `var(--bg-secondary)` |
| `bg-card` | `var(--bg-card)` |
| `bg-popover` | `var(--bg-elevated)` |

### Border Colors

| Old Tailwind Class | New CSS Variable |
|-------------------|------------------|
| `border-border` | `var(--border-default)` |
| `border-border/50` | `var(--border-subtle)` |
| `border-primary` | `var(--accent-primary)` |
| `ring-ring` | `var(--border-focus)` |

## Component-Specific Patterns

### Invoice Status Badge

```tsx
interface StatusBadgeProps {
  status: InvoiceStatus;
}

function InvoiceStatusBadge({ status }: StatusBadgeProps) {
  const statusStyles = {
    unpaid: {
      color: 'var(--status-warning)',
      backgroundColor: 'var(--status-warning-subtle)',
    },
    partially_paid: {
      color: 'var(--status-info)',
      backgroundColor: 'var(--status-info-subtle)',
    },
    paid: {
      color: 'var(--status-success)',
      backgroundColor: 'var(--status-success-subtle)',
    },
    void: {
      color: 'var(--text-disabled)',
      backgroundColor: 'var(--bg-secondary)',
    },
    overdue: {
      color: 'var(--status-error)',
      backgroundColor: 'var(--status-error-subtle)',
    },
  };

  return (
    <Badge
      style={statusStyles[status]}
      className="font-medium"
    >
      {status}
    </Badge>
  );
}
```

### Summary Stat Card

```tsx
interface StatCardProps {
  label: string;
  value: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  icon: React.ReactNode;
}

function StatCard({ label, value, variant, icon }: StatCardProps) {
  const variantStyles = {
    success: {
      background: `linear-gradient(to bottom right, var(--status-success-subtle), transparent)`,
      borderColor: 'var(--status-success)',
      color: 'var(--status-success)',
    },
    error: {
      background: `linear-gradient(to bottom right, var(--status-error-subtle), transparent)`,
      borderColor: 'var(--status-error)',
      color: 'var(--status-error)',
    },
    warning: {
      background: `linear-gradient(to bottom right, var(--status-warning-subtle), transparent)`,
      borderColor: 'var(--status-warning)',
      color: 'var(--status-warning)',
    },
    info: {
      background: `linear-gradient(to bottom right, var(--status-info-subtle), transparent)`,
      borderColor: 'var(--status-info)',
      color: 'var(--status-info)',
    },
  };

  return (
    <Card
      style={{
        background: variantStyles[variant].background,
        borderColor: variantStyles[variant].borderColor,
      }}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {label}
          </p>
          <div style={{ color: variantStyles[variant].color }}>
            {icon}
          </div>
        </div>
        <p
          className="text-xl font-bold"
          style={{ color: variantStyles[variant].color }}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
```

### Invoice List Item

```tsx
interface InvoiceListItemProps {
  invoice: InvoiceWithDetails;
  onClick: () => void;
}

function InvoiceListItem({ invoice, onClick }: InvoiceListItemProps) {
  const isOverdue = invoice.status === 'overdue';

  return (
    <Card
      className="cursor-pointer transition-all"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-default)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
        e.currentTarget.style.borderColor = 'var(--border-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-card)';
        e.currentTarget.style.borderColor = 'var(--border-default)';
      }}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p
              className="font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {invoice.invoice_number}
            </p>
            <p
              className="text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              {format(new Date(invoice.invoice_date), 'MMM dd, yyyy')}
            </p>
          </div>
          <div className="text-right">
            <p
              className="text-lg font-bold"
              style={{
                color: isOverdue
                  ? 'var(--status-error)'
                  : 'var(--text-primary)'
              }}
            >
              {formatCurrency(invoice.total_amount)}
            </p>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

## Migration Checklist

### Invoices Page (`src/app/(resident)/portal/invoices/page.tsx`)

- [ ] Update status badge colors to use CSS variables
- [ ] Replace gradient card backgrounds with CSS variable gradients
- [ ] Update outstanding balance card (error variant)
- [ ] Update wallet balance card (success variant)
- [ ] Update invoice list item hover states
- [ ] Update text colors (primary, secondary, muted)
- [ ] Update border colors
- [ ] Test with multiple themes (default, modern, dark themes)

### Wallet Page (`src/app/(resident)/portal/wallet/page.tsx`)

- [ ] Update balance card gradient
- [ ] Replace transaction type colors with CSS variables
- [ ] Update transaction list hover states
- [ ] Update top-up button colors
- [ ] Update status indicators
- [ ] Test with multiple themes

### Properties Page (`src/app/(resident)/portal/properties/page.tsx`)

- [ ] Update property card backgrounds
- [ ] Replace property type badge colors
- [ ] Update property status colors
- [ ] Update property card hover states
- [ ] Update role indicator colors
- [ ] Test with multiple themes

## Testing

After migration, verify:

1. **Theme Switching**: Colors update when changing themes
2. **Light/Dark Mode**: Readable in both modes
3. **Hover States**: Interactive elements show proper feedback
4. **Status Colors**: Semantic meaning preserved (red=error, green=success)
5. **Gradients**: Smooth and theme-appropriate
6. **Contrast**: Text readable against all backgrounds
7. **Consistency**: Similar elements use same colors

## Tools

**Browser DevTools:**
- Inspect elements to see computed CSS variables
- Toggle between themes to see real-time changes
- Check contrast ratios for accessibility

**VS Code:**
- Search for hardcoded color classes: `text-red|text-emerald|text-amber|bg-\w+-\d+`
- Replace with CSS variable patterns from this guide

## Performance Notes

- CSS variables have minimal performance impact
- Transitions remain smooth (tested up to 300ms)
- No re-renders when theme changes (only CSS updates)
- localStorage access is optimized

## Future Enhancements

After migration:
1. Create reusable components for common patterns (StatusBadge, StatCard)
2. Extract color logic into utility functions
3. Add theme preview in dev mode
4. Consider CSS-in-JS for complex dynamic styles

## References

- [Comprehensive Theme System](../themes/README.md)
- [Theme CSS Variables](../themes/README.md#css-variable-categories)
- [Icon Theming Guide](icon-theming-guide.md)
- [Sidebar Implementation](sidebar-expand-collapse.md)
