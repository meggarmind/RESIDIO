'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, Clock, XCircle, Info, TrendingUp, TrendingDown } from 'lucide-react';

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
        active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        inactive: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
        up: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
        down: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'info',
      size: 'md',
    },
  }
);

const iconMap = {
  success: CheckCircle2,
  warning: AlertCircle,
  error: XCircle,
  info: Info,
  pending: Clock,
  active: CheckCircle2,
  inactive: XCircle,
  up: TrendingUp,
  down: TrendingDown,
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof statusBadgeVariants> {
  children: React.ReactNode;
  showIcon?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  pulse?: boolean;
}

/**
 * StatusBadge Component
 *
 * Enhanced badge component with icons, animations, and multiple variants.
 *
 * @example
 * <StatusBadge variant="success" showIcon>Active</StatusBadge>
 * <StatusBadge variant="warning" pulse>Pending</StatusBadge>
 * <StatusBadge variant="up" showIcon>+12%</StatusBadge>
 */
export function StatusBadge({
  className,
  variant,
  size,
  children,
  showIcon = false,
  icon,
  pulse = false,
  ...props
}: StatusBadgeProps) {
  const Icon = icon || (variant && iconMap[variant]);

  return (
    <div className={cn(statusBadgeVariants({ variant, size }), className, pulse && 'animate-pulse')} {...props}>
      {showIcon && Icon && <Icon className="h-3 w-3" />}
      {children}
    </div>
  );
}
