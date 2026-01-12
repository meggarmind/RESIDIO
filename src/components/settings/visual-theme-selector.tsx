'use client';

import { getAvailableThemes } from '@/lib/themes/registry';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface VisualThemeSelectorProps {
  value: string;
  onChange: (themeId: string) => void;
  context: 'admin-dashboard' | 'resident-portal';
  allowDefault?: boolean;
  disabled?: boolean;
}

/**
 * Visual Theme Selector Component
 *
 * Displays available visual themes as selectable cards with color palette previews.
 * Supports both admin (estate-wide) and resident (personal override) contexts.
 */
export function VisualThemeSelector({
  value,
  onChange,
  context,
  allowDefault = false,
  disabled = false,
}: VisualThemeSelectorProps) {
  const themes = getAvailableThemes();

  return (
    <RadioGroup value={value} onValueChange={onChange} disabled={disabled}>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Estate Default Option (for residents) */}
        {allowDefault && (
          <label
            htmlFor="theme-default"
            className={cn(
              'relative flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors',
              value === '' || value === null
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <RadioGroupItem value="" id="theme-default" />
                <div>
                  <p className="text-sm font-medium">Estate Default</p>
                  <p className="text-xs text-muted-foreground">
                    Use the theme set by your estate administrator
                  </p>
                </div>
              </div>
            </div>
          </label>
        )}

        {/* Theme Cards */}
        {themes.map((theme) => {
          const isSelected = value === theme.id;

          return (
            <label
              key={theme.id}
              htmlFor={`theme-${theme.id}`}
              className={cn(
                'relative flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {/* Theme Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value={theme.id} id={`theme-${theme.id}`} />
                  <div>
                    <p className="text-sm font-medium">{theme.name}</p>
                    <p className="text-xs text-muted-foreground">{theme.description}</p>
                  </div>
                </div>
              </div>

              {/* Color Palette Preview */}
              <div className="ml-7 flex gap-2">
                {/* Primary Accent */}
                <div
                  className="h-8 w-8 rounded-md border border-border shadow-sm"
                  style={{ backgroundColor: theme.light.accent.primary }}
                  title="Primary Accent"
                />

                {/* Secondary Accent */}
                <div
                  className="h-8 w-8 rounded-md border border-border shadow-sm"
                  style={{ backgroundColor: theme.light.accent.secondary }}
                  title="Secondary Accent"
                />

                {/* Success */}
                <div
                  className="h-8 w-8 rounded-md border border-border shadow-sm"
                  style={{ backgroundColor: theme.light.status.success }}
                  title="Success"
                />

                {/* Warning */}
                <div
                  className="h-8 w-8 rounded-md border border-border shadow-sm"
                  style={{ backgroundColor: theme.light.status.warning }}
                  title="Warning"
                />

                {/* Error */}
                <div
                  className="h-8 w-8 rounded-md border border-border shadow-sm"
                  style={{ backgroundColor: theme.light.status.error }}
                  title="Error"
                />
              </div>
            </label>
          );
        })}
      </div>
    </RadioGroup>
  );
}
