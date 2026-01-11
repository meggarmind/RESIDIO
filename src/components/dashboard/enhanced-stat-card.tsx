'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useVisualTheme } from '@/contexts/visual-theme-context';
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
}

/**
 * Enhanced Stat Card Component
 *
 * Theme-aware stat card with gradient accents and improved visual hierarchy.
 * Adapts to Modern theme with distinct styling while maintaining compatibility
 * with the Default theme.
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
}: EnhancedStatCardProps) {
  const { themeId } = useVisualTheme();
  const isModern = themeId === 'modern';

  // Color mappings for accent colors with enhanced gradients
  const accentColors = {
    default: {
      iconBg: isModern
        ? 'bg-gradient-to-br from-[#0EA5E9]/20 to-[#22D3EE]/10 dark:from-[#0EA5E9]/30 dark:to-[#22D3EE]/20'
        : 'bg-primary/10 dark:bg-primary/20',
      iconColor: isModern
        ? 'text-[#0EA5E9] dark:text-[#38BDF8]'
        : 'text-primary',
      valueColor: '',
      gradient: 'from-[#0EA5E9] to-[#22D3EE]',
    },
    success: {
      iconBg: 'bg-gradient-to-br from-emerald-100 to-green-50 dark:from-emerald-900/40 dark:to-green-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      valueColor: 'text-emerald-600 dark:text-emerald-400',
      gradient: 'from-emerald-500 to-green-400',
    },
    warning: {
      iconBg: 'bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      valueColor: 'text-amber-600 dark:text-amber-400',
      gradient: 'from-amber-500 to-orange-400',
    },
    danger: {
      iconBg: 'bg-gradient-to-br from-red-100 to-rose-50 dark:from-red-900/40 dark:to-rose-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      valueColor: 'text-red-600 dark:text-red-400',
      gradient: 'from-red-500 to-rose-400',
    },
    info: {
      iconBg: 'bg-gradient-to-br from-blue-100 to-sky-50 dark:from-blue-900/40 dark:to-sky-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      valueColor: 'text-blue-600 dark:text-blue-400',
      gradient: 'from-blue-500 to-sky-400',
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
        isModern
          ? cn(
              'rounded-2xl border-gray-200/80 dark:border-[#334155]/80',
              'bg-white/90 dark:bg-[#1E293B]/90',
              'backdrop-blur-sm',
              'hover:border-[#0EA5E9]/30 dark:hover:border-[#0EA5E9]/20',
              'shadow-soft hover:shadow-elevated',
              'transition-all duration-300 ease-out'
            )
          : 'hover:shadow-md transition-all duration-200',
        animate && 'animate-slide-up',
        className
      )}
    >
      {/* Modern theme gradient accent line with animation */}
      {isModern && (
        <div className={cn(
          'absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-80 group-hover:opacity-100 transition-opacity duration-300',
          colors.gradient
        )} />
      )}

      <CardHeader className={cn(
        'flex flex-row items-center justify-between space-y-0 pb-3',
        isModern && 'pt-5'
      )}>
        <CardTitle className={cn(
          'text-sm font-medium tracking-wide',
          isModern ? 'text-gray-500 dark:text-gray-400 uppercase text-xs' : 'text-muted-foreground'
        )}>
          {title}
        </CardTitle>
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center transition-transform duration-300 group-hover:scale-110',
            colors.iconBg,
            isModern ? 'rounded-xl shadow-sm' : 'rounded-lg'
          )}
        >
          <Icon className={cn('h-5 w-5', colors.iconColor)} />
        </div>
      </CardHeader>
      <CardContent className="pb-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className={cn(
              'h-9 w-28',
              isModern && 'rounded-lg'
            )} />
            {description && (
              <Skeleton className={cn(
                'h-4 w-24',
                isModern && 'rounded-md'
              )} />
            )}
          </div>
        ) : (
          <>
            <div className={cn(
              'text-3xl font-bold tracking-tight',
              colors.valueColor,
              isModern && 'text-gray-900 dark:text-white'
            )}>
              {value}
            </div>
            {description && (
              <p className={cn(
                'text-sm mt-1',
                isModern ? 'text-gray-500 dark:text-gray-400' : 'text-muted-foreground'
              )}>
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
  const { themeId } = useVisualTheme();
  const isModern = themeId === 'modern';

  return (
    <Card
      className={cn(
        'overflow-hidden',
        isModern
          ? cn(
              'rounded-2xl border-gray-200/80 dark:border-[#334155]/80',
              'bg-white/95 dark:bg-[#1E293B]/95',
              'backdrop-blur-sm shadow-soft',
              'hover:shadow-elevated transition-shadow duration-300'
            )
          : 'hover:shadow-md transition-shadow duration-200',
        animate && 'animate-slide-up',
        className
      )}
    >
      {(title || actions) && (
        <CardHeader className={cn(
          'flex flex-row items-center justify-between py-5',
          isModern && 'border-b border-gray-100/80 dark:border-[#334155]/80 bg-gray-50/50 dark:bg-[#0F172A]/30'
        )}>
          <div>
            {title && (
              <CardTitle className={cn(
                'text-lg font-semibold',
                isModern && 'text-gray-900 dark:text-white'
              )}>
                {title}
              </CardTitle>
            )}
            {description && (
              <p className={cn(
                'text-sm mt-1',
                isModern ? 'text-gray-500 dark:text-gray-400' : 'text-muted-foreground'
              )}>
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

/**
 * Enhanced Page Header
 *
 * Theme-aware page header with title, description, and actions.
 */
interface EnhancedPageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
  animate?: boolean;
}

export function EnhancedPageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  animate = true,
}: EnhancedPageHeaderProps) {
  const { themeId } = useVisualTheme();
  const isModern = themeId === 'modern';

  return (
    <div className={cn(
      'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4',
      animate && 'animate-slide-up',
      className
    )}>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className={cn(
            'flex h-12 w-12 items-center justify-center transition-transform duration-300 hover:scale-105',
            isModern
              ? 'rounded-2xl bg-gradient-to-br from-[#0EA5E9]/20 to-[#22D3EE]/10 dark:from-[#0EA5E9]/30 dark:to-[#22D3EE]/20 shadow-sm'
              : 'rounded-xl bg-primary/10 dark:bg-primary/20'
          )}>
            <Icon className={cn(
              'h-6 w-6',
              isModern
                ? 'text-[#0EA5E9] dark:text-[#38BDF8]'
                : 'text-primary'
            )} />
          </div>
        )}
        <div>
          <h1 className={cn(
            'text-2xl sm:text-3xl font-bold tracking-tight',
            isModern && 'text-gray-900 dark:text-white'
          )}>
            {title}
          </h1>
          {description && (
            <p className={cn(
              'text-sm sm:text-base mt-1',
              isModern ? 'text-gray-500 dark:text-gray-400' : 'text-muted-foreground'
            )}>
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}

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
  const { themeId } = useVisualTheme();
  const isModern = themeId === 'modern';

  const typeStyles = {
    info: {
      bg: isModern
        ? 'bg-gradient-to-r from-blue-50 to-sky-50/50 dark:from-blue-900/30 dark:to-sky-900/20 border-blue-200/80 dark:border-blue-700/50'
        : 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900',
      iconBg: 'bg-blue-100 dark:bg-blue-900/50',
      icon: 'text-blue-600 dark:text-blue-400',
      title: 'text-blue-900 dark:text-blue-100',
      description: 'text-blue-700 dark:text-blue-300',
    },
    warning: {
      bg: isModern
        ? 'bg-gradient-to-r from-amber-50 to-orange-50/50 dark:from-amber-900/30 dark:to-orange-900/20 border-amber-200/80 dark:border-amber-700/50'
        : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900',
      iconBg: 'bg-amber-100 dark:bg-amber-900/50',
      icon: 'text-amber-600 dark:text-amber-400',
      title: 'text-amber-900 dark:text-amber-100',
      description: 'text-amber-700 dark:text-amber-300',
    },
    success: {
      bg: isModern
        ? 'bg-gradient-to-r from-emerald-50 to-green-50/50 dark:from-emerald-900/30 dark:to-green-900/20 border-emerald-200/80 dark:border-emerald-700/50'
        : 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
      icon: 'text-emerald-600 dark:text-emerald-400',
      title: 'text-emerald-900 dark:text-emerald-100',
      description: 'text-emerald-700 dark:text-emerald-300',
    },
    error: {
      bg: isModern
        ? 'bg-gradient-to-r from-red-50 to-rose-50/50 dark:from-red-900/30 dark:to-rose-900/20 border-red-200/80 dark:border-red-700/50'
        : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900',
      iconBg: 'bg-red-100 dark:bg-red-900/50',
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
        isModern && 'rounded-2xl p-5 backdrop-blur-sm',
        styles.bg,
        animate && 'animate-slide-up',
        className
      )}
    >
      <div className="flex items-start gap-4">
        {Icon && (
          <div className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0',
            isModern && styles.iconBg
          )}>
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
