import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Progress Bar Component - Modern Design System
 *
 * Animated progress indicator following the portal-modern design system.
 *
 * Design Specifications:
 * - Height: 6px
 * - Border radius: Full (pill shape)
 * - Background: Light gray (var(--color-bg-input))
 * - Fill: Animated width transition (300ms ease)
 * - Variants: success, warning, primary, cyan
 *
 * Usage:
 * <ProgressBar value={75} variant="success" />
 * <ProgressBar value={45} variant="warning" className="w-full" />
 */

interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Progress value (0-100) */
  value: number;
  /** Color variant */
  variant?: 'success' | 'warning' | 'primary' | 'cyan';
  /** Show percentage label */
  showLabel?: boolean;
}

export function ProgressBar({
  value,
  variant = 'primary',
  showLabel = false,
  className,
  ...props
}: ProgressBarProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.min(100, Math.max(0, value));

  const variantColors = {
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    primary: 'var(--color-primary)',
    cyan: 'var(--color-accent-cyan)',
  };

  return (
    <div className={cn('w-full', className)} {...props}>
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-medium)',
              color: 'var(--color-text-muted)',
            }}
          >
            Progress
          </span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {clampedValue}%
          </span>
        </div>
      )}
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('progress-bar-fill', variant)}
          style={{
            width: `${clampedValue}%`,
            background: variantColors[variant],
          }}
        />
      </div>
    </div>
  );
}
