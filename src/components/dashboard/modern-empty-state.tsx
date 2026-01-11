'use client';

import { cn } from '@/lib/utils';
import {
  Receipt,
  CheckCircle2,
  History,
  Users,
  CreditCard,
  Home,
  FileText,
  Bell,
  Search,
  Inbox,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

/**
 * Modern Theme Empty State Components
 *
 * Features:
 * - Centered layout with icon + message
 * - Modern theme color palette
 * - Positive, friendly messaging tone
 * - Dark mode compatible
 * - Subtle animations for engagement
 * - Glass morphism backgrounds
 */

interface ModernEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  action?: React.ReactNode;
  animate?: boolean;
}

/**
 * Base Modern Empty State component
 */
export function ModernEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  className,
  action,
  animate = true,
}: ModernEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-8 text-center',
        'rounded-2xl',
        'bg-gradient-to-br from-gray-50/80 to-gray-100/50 dark:from-[#0F172A]/80 dark:to-[#1E293B]/50',
        'backdrop-blur-sm border border-gray-100 dark:border-[#334155]/50',
        animate && 'animate-slide-up',
        className
      )}
    >
      <div
        className={cn(
          'mb-5 flex h-20 w-20 items-center justify-center rounded-2xl',
          'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-[#1E293B] dark:to-[#0F172A]',
          'shadow-soft transition-transform duration-300 hover:scale-105',
          animate && 'animate-float'
        )}
      >
        <Icon className="h-10 w-10 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/**
 * Transactions Empty State
 */
export function ModernTransactionsEmptyState({ className }: { className?: string }) {
  return (
    <ModernEmptyState
      icon={Receipt}
      title="No transactions yet"
      description="When transactions are recorded, they will appear here."
      className={className}
    />
  );
}

/**
 * Pending Payments Empty State (Positive tone - all caught up!)
 */
export function ModernPendingPaymentsEmptyState({ className, animate = true }: { className?: string; animate?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-10 px-8 text-center',
        'rounded-2xl',
        'bg-gradient-to-br from-emerald-50 to-green-50/50 dark:from-emerald-900/20 dark:to-green-900/10',
        'border border-emerald-100/80 dark:border-emerald-700/30',
        animate && 'animate-slide-up',
        className
      )}
    >
      <div
        className={cn(
          'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
          'bg-gradient-to-br from-emerald-100 to-green-50 dark:from-emerald-900/30 dark:to-green-900/20',
          'shadow-sm'
        )}
      >
        <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-emerald-500" />
        <h3 className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
          All caught up!
        </h3>
        <Sparkles className="h-4 w-4 text-emerald-500" />
      </div>
      <p className="text-sm text-emerald-700 dark:text-emerald-300">
        No pending payments to review.
      </p>
    </div>
  );
}

/**
 * Activity Log Empty State
 */
export function ModernActivityEmptyState({ className }: { className?: string }) {
  return (
    <ModernEmptyState
      icon={History}
      title="No recent activity"
      description="Activity will appear here as you use the system."
      className={className}
    />
  );
}

/**
 * Residents Empty State
 */
export function ModernResidentsEmptyState({ className }: { className?: string }) {
  return (
    <ModernEmptyState
      icon={Users}
      title="No residents found"
      description="Add your first resident to get started."
      className={className}
    />
  );
}

/**
 * Payments Empty State
 */
export function ModernPaymentsEmptyState({ className }: { className?: string }) {
  return (
    <ModernEmptyState
      icon={CreditCard}
      title="No payments recorded"
      description="Payments will appear here once they are processed."
      className={className}
    />
  );
}

/**
 * Houses Empty State
 */
export function ModernHousesEmptyState({ className }: { className?: string }) {
  return (
    <ModernEmptyState
      icon={Home}
      title="No properties found"
      description="Add properties to start managing your estate."
      className={className}
    />
  );
}

/**
 * Documents Empty State
 */
export function ModernDocumentsEmptyState({ className }: { className?: string }) {
  return (
    <ModernEmptyState
      icon={FileText}
      title="No documents yet"
      description="Upload documents to share with residents."
      className={className}
    />
  );
}

/**
 * Notifications Empty State
 */
export function ModernNotificationsEmptyState({ className, animate = true }: { className?: string; animate?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-10 px-8 text-center',
        'rounded-2xl',
        'bg-gradient-to-br from-blue-50 to-sky-50/50 dark:from-blue-900/20 dark:to-sky-900/10',
        'border border-blue-100/80 dark:border-blue-700/30',
        animate && 'animate-slide-up',
        className
      )}
    >
      <div
        className={cn(
          'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
          'bg-gradient-to-br from-blue-100 to-sky-50 dark:from-blue-900/30 dark:to-sky-900/20',
          'shadow-sm'
        )}
      >
        <Bell className="h-8 w-8 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-blue-500" />
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
          You&apos;re all caught up!
        </h3>
        <Sparkles className="h-4 w-4 text-blue-500" />
      </div>
      <p className="text-sm text-blue-700 dark:text-blue-300">
        No new notifications.
      </p>
    </div>
  );
}

/**
 * Search Results Empty State
 */
export function ModernSearchEmptyState({
  query,
  className,
}: {
  query?: string;
  className?: string;
}) {
  return (
    <ModernEmptyState
      icon={Search}
      title="No results found"
      description={
        query
          ? `We couldn't find anything matching "${query}". Try adjusting your search.`
          : 'Try searching for something specific.'
      }
      className={className}
    />
  );
}

/**
 * Generic Empty State with customizable icon color
 */
export function ModernCustomEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  iconColor = 'gray',
  className,
  action,
}: ModernEmptyStateProps & {
  iconColor?: 'gray' | 'blue' | 'emerald' | 'amber' | 'red';
}) {
  const colorClasses = {
    gray: {
      bg: 'bg-gray-50 dark:bg-[#0F172A]',
      iconBg: 'bg-gray-100 dark:bg-[#1E293B]',
      iconColor: 'text-gray-400 dark:text-gray-500',
      title: 'text-gray-900 dark:text-white',
      description: 'text-gray-500 dark:text-gray-400',
    },
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/10',
      iconBg: 'bg-blue-100 dark:bg-blue-900/20',
      iconColor: 'text-blue-600 dark:text-blue-400',
      title: 'text-blue-900 dark:text-blue-100',
      description: 'text-blue-700 dark:text-blue-300',
    },
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/10',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      title: 'text-emerald-900 dark:text-emerald-100',
      description: 'text-emerald-700 dark:text-emerald-300',
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-900/10',
      iconBg: 'bg-amber-100 dark:bg-amber-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      title: 'text-amber-900 dark:text-amber-100',
      description: 'text-amber-700 dark:text-amber-300',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-900/10',
      iconBg: 'bg-red-100 dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      title: 'text-red-900 dark:text-red-100',
      description: 'text-red-700 dark:text-red-300',
    },
  };

  const colors = colorClasses[iconColor];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-6 text-center rounded-xl',
        colors.bg,
        className
      )}
    >
      <div
        className={cn(
          'mb-4 flex h-16 w-16 items-center justify-center rounded-full',
          colors.iconBg
        )}
      >
        <Icon className={cn('h-8 w-8', colors.iconColor)} />
      </div>
      <h3 className={cn('text-lg font-semibold mb-1', colors.title)}>{title}</h3>
      {description && (
        <p className={cn('text-sm max-w-sm', colors.description)}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
