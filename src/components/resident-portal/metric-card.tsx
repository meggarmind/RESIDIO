import * as React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconBox } from '@/components/ui/icon-box';
import { ProgressBar } from '@/components/ui/progress-bar';

/**
 * Metric Card Component - Modern Design System
 *
 * Card for displaying key metrics with large numbers, trends, and progress bars.
 *
 * Design Specifications:
 * - Background: White card (var(--color-bg-card))
 * - Border radius: 12px (var(--radius-lg))
 * - Shadow: var(--shadow-md)
 * - Padding: 24px (var(--space-6))
 * - Layout: Label → Value → Trend → Progress bar
 *
 * Example:
 * "Total Balance"
 * "$17,351"
 * "+13.54% this month" (green with arrow)
 * [Progress bar at 75%]
 *
 * Usage:
 * <MetricCard
 *   label="Total Balance"
 *   value="$17,351"
 *   trend={13.54}
 *   trendLabel="this month"
 *   icon={<Wallet />}
 *   iconColor="blue"
 *   progress={75}
 *   progressVariant="success"
 * />
 */

interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Metric label (e.g., "Total Balance") */
  label: string;
  /** Metric value (e.g., "$17,351") */
  value: string | number;
  /** Optional trend percentage (positive or negative) */
  trend?: number | null;
  /** Optional trend label (e.g., "this month") */
  trendLabel?: string;
  /** Optional subtitle (alternative to trend) */
  subtitle?: string;
  /** Optional icon to display */
  icon?: React.ReactNode;
  /** Icon background color */
  iconColor?: 'pink' | 'blue' | 'purple' | 'orange' | 'green' | 'cyan';
  /** Optional progress bar value (0-100) */
  progress?: number;
  /** Progress bar color variant */
  progressVariant?: 'success' | 'warning' | 'primary' | 'cyan';
  /** Optional trend direction (for styling) - deprecated, use trend sign instead */
  trendDirection?: 'up' | 'down';
}

export function MetricCard({
  label,
  value,
  trend,
  trendLabel,
  subtitle,
  icon,
  iconColor = 'blue',
  progress,
  progressVariant = 'primary',
  className,
  trendDirection, // Destructure to exclude from props spread (deprecated)
  ...props
}: MetricCardProps) {
  // Check if trend is a valid number (not null, not undefined)
  const hasTrend = trend != null;
  const isPositiveTrend = hasTrend && trend >= 0;

  return (
    <div
      className={cn('card card-interactive', className)}
      {...props}
    >
      {/* Header: Label + Icon */}
      <div className="flex items-start justify-between mb-4">
        <div className="metric-block">
          <div className="metric-label">{label}</div>
        </div>
        {icon && (
          <IconBox color={iconColor} size="md">
            {icon}
          </IconBox>
        )}
      </div>

      {/* Large Metric Value */}
      <div className="metric-value mb-2">{value}</div>

      {/* Trend Indicator or Subtitle */}
      {hasTrend && (
        <div
          className={cn(
            'metric-trend',
            isPositiveTrend ? '' : 'negative'
          )}
        >
          {isPositiveTrend ? (
            <ArrowUp style={{ width: '12px', height: '12px' }} />
          ) : (
            <ArrowDown style={{ width: '12px', height: '12px' }} />
          )}
          <span>
            {isPositiveTrend ? '+' : ''}
            {trend.toFixed(2)}%
            {trendLabel && ` ${trendLabel}`}
          </span>
        </div>
      )}
      {!hasTrend && subtitle && (
        <div className="metric-trend" style={{ color: 'var(--color-text-secondary)' }}>
          <span>{subtitle}</span>
        </div>
      )}

      {/* Optional Progress Bar */}
      {progress !== undefined && (
        <div className="mt-4">
          <ProgressBar value={progress} variant={progressVariant} />
        </div>
      )}
    </div>
  );
}
