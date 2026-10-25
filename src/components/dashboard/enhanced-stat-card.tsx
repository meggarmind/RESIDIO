'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface EnhancedStatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  isLoading?: boolean;
  description?: string;
  trend?: {
    value: number;
    label: string;
    direction: 'up' | 'down' | 'neutral';
  };
  accentColor?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  animate?: boolean;
  onClick?: () => void;
}

/**
 * Font size that lets a long value (e.g. a currency total) shrink to fit the
 * card's width instead of overflowing, while short values keep text-3xl.
 * 0.65em per character was measured to fit currency strings in the theme fonts.
 * Requires the value's parent to be an `@container`.
 */
export function statValueFontSize(value: string | number): string {
  const chars = Math.max(String(value).length, 1);
  return `min(1.875rem, calc(100cqi / ${+(chars * 0.65).toFixed(2)}))`;
}

/**
 * Enhanced Stat Card Component
 *
 * Theme-aware stat card with gradient accents and improved visual hierarchy.
 * Follows the active theme tokens.
 *
 * Features:
 * - Gradient icon backgrounds with glow effect
 * - Theme-specific color accents
 * - Loading skeletons with shimmer effect
 * - Optional trend indicators with icons
 * - Dark mode support
 * - Micro-animations on hover
 */
export function EnhancedStatCard({
  title,
  value,
  icon: Icon,
  isLoading = false,
  description,
  trend,
  accentColor = 'default',
  className,
  animate = true,
  onClick,
}: EnhancedStatCardProps) {
  // Color mappings for accent colors with enhanced gradients
  const accentColors = {
    default: {
      iconBg: 'bg-primary/10 dark:bg-primary/20',
      iconColor: 'text-primary',
      valueColor: '',
    },
    success: {
      iconBg: 'bg-gradient-to-br from-emerald-100 to-green-50 dark:from-emerald-900/40 dark:to-green-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      valueColor: 'text-emerald-600 dark:text-emerald-400',
    },
    warning: {
      iconBg: 'bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      valueColor: 'text-amber-600 dark:text-amber-400',
    },
    danger: {
      iconBg: 'bg-gradient-to-br from-red-100 to-rose-50 dark:from-red-900/40 dark:to-rose-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      valueColor: 'text-red-600 dark:text-red-400',
    },
    info: {
      iconBg: 'bg-gradient-to-br from-blue-100 to-sky-50 dark:from-blue-900/40 dark:to-sky-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      valueColor: 'text-blue-600 dark:text-blue-400',
    },
  };

  const colors = accentColors[accentColor];

  const trendConfig = {
    up: {
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-100/80 dark:bg-emerald-900/30',
      icon: TrendingUp,
    },
    down: {
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-100/80 dark:bg-red-900/30',
      icon: TrendingDown,
    },
    neutral: {
      color: 'text-muted-foreground',
      bg: 'bg-muted/50',
      icon: Minus,
    },
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden group',
        'hover:shadow-md transition-all duration-200',
        animate && 'animate-slide-up',
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center transition-transform duration-300 group-hover:scale-110',
            colors.iconBg,
            'rounded-lg'
          )}
        >
          <Icon className={cn('h-5 w-5', colors.iconColor)} />
        </div>
      </CardHeader>
      <CardContent className="@container pb-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-28" />
            {description && <Skeleton className="h-4 w-24" />}
          </div>
        ) : (
          <>
            <div
              className={cn(
                'text-3xl font-bold tracking-tight tabular-nums whitespace-nowrap',
                colors.valueColor
              )}
              style={{ fontSize: statValueFontSize(value) }}
            >
              {value}
            </div>
            {description && (
              <p className="text-sm mt-1 text-muted-foreground">
                {description}
              </p>
            )}
            {trend && (
              <div className="flex items-center gap-2 mt-3">
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                  trendConfig[trend.direction].bg,
                  trendConfig[trend.direction].color
                )}>
                  {React.createElement(trendConfig[trend.direction].icon, { className: 'h-3 w-3' })}
                  {trend.value}%
                </span>
                <span className="text-xs text-muted-foreground">{trend.label}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Enhanced Table Card Wrapper
 *
 * Theme-aware card wrapper for tables with improved styling.
 */
interface EnhancedTableCardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  animate?: boolean;
}

export function EnhancedTableCard({
  title,
  description,
  children,
  actions,
  className,
  animate = true,
}: EnhancedTableCardProps) {
  return (
    <Card
      className={cn(
        'overflow-hidden',
        'hover:shadow-md transition-shadow duration-200',
        animate && 'animate-slide-up',
        className
      )}
    >
      {(title || actions) && (
        <CardHeader className="flex flex-row items-center justify-between py-5">
          <div>
            {title && (
              <CardTitle className="text-lg font-semibold">
                {title}
              </CardTitle>
            )}
            {description && (
              <p className="text-sm mt-1 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={cn(
        'pt-0',
        !title && !actions && 'pt-6'
      )}>
        {children}
      </CardContent>
    </Card>
  );
}

export { EnhancedPageHeader } from './page-header';

/**
 * Enhanced Alert Banner
 *
 * Theme-aware alert banner for important notifications.
 */
interface EnhancedAlertBannerProps {
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  animate?: boolean;
}

export function EnhancedAlertBanner({
  type,
  title,
  description,
  icon: Icon,
  action,
  className,
  animate = true,
}: EnhancedAlertBannerProps) {
  const typeStyles = {
    info: {
      bg: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900',
      icon: 'text-blue-600 dark:text-blue-400',
      title: 'text-blue-900 dark:text-blue-100',
      description: 'text-blue-700 dark:text-blue-300',
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900',
      icon: 'text-amber-600 dark:text-amber-400',
      title: 'text-amber-900 dark:text-amber-100',
      description: 'text-amber-700 dark:text-amber-300',
    },
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900',
      icon: 'text-emerald-600 dark:text-emerald-400',
      title: 'text-emerald-900 dark:text-emerald-100',
      description: 'text-emerald-700 dark:text-emerald-300',
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900',
      icon: 'text-red-600 dark:text-red-400',
      title: 'text-red-900 dark:text-red-100',
      description: 'text-red-700 dark:text-red-300',
    },
  };

  const styles = typeStyles[type];

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        styles.bg,
        animate && 'animate-slide-up',
        className
      )}
    >
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0">
            <Icon className={cn('h-5 w-5', styles.icon)} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className={cn('font-semibold', styles.title)}>{title}</p>
          {description && (
            <p className={cn('text-sm mt-1', styles.description)}>
              {description}
            </p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  );
}
