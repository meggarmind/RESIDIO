'use client';

import { useState, useCallback } from 'react';
import { getAllThemes } from '@/lib/themes/tweakcn-registry';
import type { TweakcnTheme } from '@/types/theme';

// Legacy type alias for compatibility
type VisualTheme = TweakcnTheme;
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface VisualThemeSelectorProps {
  value: string;
  onChange: (themeId: string) => void;
  context: 'admin-dashboard' | 'resident-portal';
  allowDefault?: boolean;
  disabled?: boolean;
}

function ThemeCard({
  theme,
  isSelected,
  isPreview,
  disabled,
  onHoverStart,
  onHoverEnd,
  onTap,
  mobilePreviewActive,
}: {
  theme: VisualTheme;
  isSelected: boolean;
  isPreview: boolean;
  disabled: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onTap: () => void;
  mobilePreviewActive: boolean;
}) {
  return (
    <label
      htmlFor={`theme-${theme.id}`}
      className={cn(
        'relative flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-all duration-200',
        isSelected
          ? 'border-primary bg-primary/5 ring-2 ring-primary shadow-md'
          : isPreview
            ? 'border-primary/70 bg-primary/10 ring-1 ring-primary/50 scale-[1.02]'
            : 'border-border hover:border-primary/50 hover:shadow-sm',
        disabled && 'cursor-not-allowed opacity-50'
      )}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onClick={onTap}
    >
      {/* Selected Indicator */}
      {isSelected && (
        <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full p-1 shadow-lg">
          <Check className="h-3 w-3" />
        </div>
      )}

      {/* Mobile Preview Badge */}
      {mobilePreviewActive && !isSelected && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap">
          Tap again to select
        </div>
      )}

      {/* Theme Header */}
      <div className="flex items-center gap-2">
        <RadioGroupItem value={theme.id} id={`theme-${theme.id}`} className="h-4 w-4" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{theme.name}</p>
        </div>
      </div>

      {/* Color Palette Preview - Larger swatches for visual impact */}
      <div className="flex gap-1">
        {/* Background preview */}
        <div className="flex-1 h-8 rounded-l-md overflow-hidden flex">
          <div
            className="flex-1"
            style={{ backgroundColor: theme.cssVars.light.background }}
            title="Light Background"
          />
          <div
            className="flex-1"
            style={{ backgroundColor: theme.cssVars.dark.background }}
            title="Dark Background"
          />
        </div>
        {/* Accent colors */}
        <div
          className="h-8 w-8 rounded-md border border-border shadow-sm"
          style={{ backgroundColor: theme.cssVars.light.primary }}
          title="Primary Color"
        />
        <div
          className="h-8 w-8 rounded-md border border-border shadow-sm"
          style={{ backgroundColor: theme.cssVars.light.accent }}
          title="Accent Color"
        />
        <div
          className="h-8 w-8 rounded-r-md border border-border shadow-sm"
          style={{ backgroundColor: theme.cssVars.light['chart-3'] }}
          title="Success (Chart 3)"
        />
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground line-clamp-1">{theme.description}</p>
    </label>
  );
}

/**
 * Visual Theme Selector Component with Live Hover Preview
 *
 * Displays all available visual themes in a grid layout.
 * Hovering over a theme card applies a live preview to the entire application.
 * Supports both admin (estate-wide) and resident (personal override) contexts.
 */
export function VisualThemeSelector({
  value,
  onChange,
  context,
  allowDefault = false,
  disabled = false,
}: VisualThemeSelectorProps) {
  const allThemes = getAllThemes();
  const { setPreviewThemeId } = useVisualTheme();
  const [mobilePreviewId, setMobilePreviewId] = useState<string | null>(null);

  // Handle hover preview (desktop)
  const handleHoverStart = useCallback((themeId: string) => {
    if (!disabled) {
      setPreviewThemeId(themeId);
    }
  }, [disabled, setPreviewThemeId]);

  const handleHoverEnd = useCallback(() => {
    setPreviewThemeId(null);
    setMobilePreviewId(null);
  }, [setPreviewThemeId]);

  // Handle tap (mobile behavior: tap to preview, tap again to select)
  const handleTap = useCallback((themeId: string) => {
    if (disabled) return;

    // If already in preview for this theme, select it
    if (mobilePreviewId === themeId) {
      onChange(themeId);
      setMobilePreviewId(null);
      setPreviewThemeId(null);
    } else {
      // First tap: show preview
      setMobilePreviewId(themeId);
      setPreviewThemeId(themeId);
    }
  }, [disabled, mobilePreviewId, onChange, setPreviewThemeId]);

  return (
    <RadioGroup value={value} onValueChange={onChange} disabled={disabled}>
      <div className="space-y-4">
        {/* Estate Default Option (for residents) */}
        {allowDefault && (
          <div className="mb-4">
            <label
              htmlFor="theme-estate-default"
              className={cn(
                'relative flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors',
                value === '' || value === null
                  ? 'border-primary bg-primary/5 ring-2 ring-primary'
                  : 'border-border hover:border-primary/50',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              <RadioGroupItem value="" id="theme-estate-default" />
              <div>
                <p className="text-sm font-medium">Estate Default</p>
                <p className="text-xs text-muted-foreground">
                  Use the theme set by your estate administrator
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Themes Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {allThemes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isSelected={value === theme.id}
              isPreview={mobilePreviewId === theme.id && value !== theme.id}
              disabled={disabled}
              onHoverStart={() => handleHoverStart(theme.id)}
              onHoverEnd={handleHoverEnd}
              onTap={() => handleTap(theme.id)}
              mobilePreviewActive={mobilePreviewId === theme.id && value !== theme.id}
            />
          ))}
        </div>

        {/* Mobile Confirm Selection Button */}
        {mobilePreviewId && mobilePreviewId !== value && (
          <div className="fixed bottom-4 left-4 right-4 sm:hidden z-50">
            <Button
              size="lg"
              className="w-full shadow-lg"
              onClick={() => {
                onChange(mobilePreviewId);
                setMobilePreviewId(null);
                setPreviewThemeId(null);
              }}
            >
              <Check className="mr-2 h-4 w-4" />
              Confirm Selection
            </Button>
          </div>
        )}
      </div>
    </RadioGroup>
  );
}
