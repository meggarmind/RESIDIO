import * as React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

/**
 * Stats Grid Component - Modern Design System
 *
 * Compact grid for displaying small metric cards (e.g., Users, Clicks, Sales, Items).
 *
 * Design Specifications:
 * - Grid: 2x2 layout
 * - Gap: 16px (var(--space-4))
 * - Each stat: Icon + Label + Value
 * - Background: White card (var(--color-bg-card))
 * - Border radius: 12px (var(--radius-lg))
 * - Padding: 16px (var(--space-4))
 * - Icon size: 20px
 * - Label: 12px gray
 * - Value: 20px bold
 *
 * Example:
 * Grid Layout:
 * [Users 19K] [Clicks 2.5M]
 * [Sales 41$] [Items 78]
 *
 * Usage:
 * <StatsGrid
 *   stats={[
 *     { label: 'Users', value: '19K', icon: Users, iconColor: 'blue' },
 *     { label: 'Clicks', value: '2.5M', icon: MousePointer, iconColor: 'purple' },
 *     { label: 'Sales', value: '41$', icon: DollarSign, iconColor: 'green' },
 *     { label: 'Items', value: '78', icon: Package, iconColor: 'orange' },
 *   ]}
 * />
 */

interface Stat {
  /** Stat label */
  label: string;
  /** Stat value */
  value: string | number;
  /** Icon component */
  icon: LucideIcon;
  /** Icon color */
  iconColor?: 'pink' | 'blue' | 'purple' | 'orange' | 'green' | 'cyan';
}

interface StatsGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Array of stats to display (ideally 4 items for 2x2 grid) */
  stats: Stat[];
}

export function StatsGrid({ stats, className, ...props }: StatsGridProps) {
  const iconColorMap = {
    pink: 'var(--color-icon-bg-pink)',
    blue: 'var(--color-icon-bg-blue)',
    purple: 'var(--color-icon-bg-purple)',
    orange: 'var(--color-icon-bg-orange)',
    green: 'var(--color-icon-bg-green)',
    cyan: 'var(--color-icon-bg-cyan)',
  };

  return (
    <div
      className={cn('grid grid-cols-2 gap-4', className)}
      {...props}
    >
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className="card"
            style={{
              padding: 'var(--space-4)', // 16px
            }}
          >
            {/* Icon */}
            <div
              className="flex items-center justify-center mb-2"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-md)',
                background: stat.iconColor
                  ? iconColorMap[stat.iconColor]
                  : 'var(--color-icon-bg-blue)',
              }}
            >
              <Icon
                style={{
                  width: 'var(--icon-sm)', // 20px
                  height: 'var(--icon-sm)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>

            {/* Label */}
            <p
              style={{
                fontSize: 'var(--text-xs)', // 12px
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--space-1)',
              }}
            >
              {stat.label}
            </p>

            {/* Value */}
            <p
              style={{
                fontSize: 'var(--text-xl)', // 20px
                fontWeight: 'var(--font-bold)',
                color: 'var(--color-text-primary)',
              }}
            >
              {stat.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
