'use client';

import { cn } from '@/lib/utils';

/**
 * Modern Theme Skeleton Components
 *
 * Features:
 * - Shimmer animation (gradient sweep instead of pulse)
 * - Modern theme color palette
 * - Generous rounded corners (rounded-xl)
 * - Dark mode compatible
 */

interface ModernSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Base Modern Skeleton with shimmer effect
 */
export function ModernSkeleton({ className, ...props }: ModernSkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-gray-200 dark:bg-[#334155]',
        // Shimmer animation
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:animate-[shimmer_2s_infinite]',
        'before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent',
        'dark:before:via-white/10',
        className
      )}
      {...props}
    />
  );
}

/**
 * Modern Stats Card Skeleton
 * Matches the stats card dimensions with Modern theme styling
 */
export function ModernStatsCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-[#1E293B] p-6',
        'border-gray-200 dark:border-[#334155]',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <ModernSkeleton className="h-5 w-24" />
        <ModernSkeleton className="h-8 w-8 rounded-lg" />
      </div>
      <ModernSkeleton className="h-10 w-32 mb-2" />
      <ModernSkeleton className="h-4 w-20" />
    </div>
  );
}

/**
 * Modern Financial Health Card Skeleton
 * Circular progress indicator + metrics
 */
export function ModernFinancialHealthSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-[#1E293B] p-6',
        'border-gray-200 dark:border-[#334155]',
        className
      )}
    >
      <div className="flex items-center justify-between mb-6">
        <ModernSkeleton className="h-6 w-36" />
        <ModernSkeleton className="h-8 w-20 rounded-lg" />
      </div>
      <div className="flex items-center gap-6">
        {/* Circular progress skeleton */}
        <ModernSkeleton className="h-24 w-24 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="flex justify-between">
            <ModernSkeleton className="h-4 w-20" />
            <ModernSkeleton className="h-4 w-16" />
          </div>
          <div className="flex justify-between">
            <ModernSkeleton className="h-4 w-24" />
            <ModernSkeleton className="h-4 w-16" />
          </div>
          <div className="flex justify-between">
            <ModernSkeleton className="h-4 w-16" />
            <ModernSkeleton className="h-4 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modern Pending Payments Card Skeleton
 * List items with Modern theme styling
 */
export function ModernPendingPaymentsSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-[#1E293B] p-6',
        'border-gray-200 dark:border-[#334155]',
        className
      )}
    >
      <div className="flex items-center justify-between mb-6">
        <ModernSkeleton className="h-6 w-36" />
        <ModernSkeleton className="h-6 w-6 rounded-full" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-[#0F172A]">
            <ModernSkeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <ModernSkeleton className="h-4 w-32" />
              <ModernSkeleton className="h-3 w-20" />
            </div>
            <ModernSkeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Modern Table Row Skeleton
 */
export function ModernTableRowSkeleton({
  columns = 5,
  className,
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 border-b border-gray-100 dark:border-[#334155]',
        className
      )}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <ModernSkeleton
          key={i}
          className={cn(
            'h-4',
            i === 0 ? 'w-10' : i === columns - 1 ? 'w-20' : 'flex-1'
          )}
        />
      ))}
    </div>
  );
}

/**
 * Modern Table Skeleton
 * Multiple rows with header
 */
export function ModernTableSkeleton({
  rows = 5,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-[#1E293B]',
        'border-gray-200 dark:border-[#334155]',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b-2 border-gray-200 dark:border-[#334155]">
        {Array.from({ length: columns }).map((_, i) => (
          <ModernSkeleton
            key={i}
            className={cn(
              'h-4',
              i === 0 ? 'w-10' : i === columns - 1 ? 'w-20' : 'flex-1'
            )}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <ModernTableRowSkeleton key={i} columns={columns} />
      ))}
    </div>
  );
}

/**
 * Modern Quick Action Card Skeleton
 */
export function ModernQuickActionSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-[#1E293B] p-4',
        'border-gray-200 dark:border-[#334155]',
        'flex items-center gap-4',
        className
      )}
    >
      <ModernSkeleton className="h-10 w-10 rounded-xl" />
      <div className="flex-1 space-y-2">
        <ModernSkeleton className="h-4 w-24" />
        <ModernSkeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

/**
 * Modern Activity Log Skeleton
 */
export function ModernActivityLogSkeleton({
  items = 5,
  className,
}: {
  items?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-[#1E293B] p-6',
        'border-gray-200 dark:border-[#334155]',
        className
      )}
    >
      <div className="flex items-center justify-between mb-6">
        <ModernSkeleton className="h-6 w-28" />
        <ModernSkeleton className="h-8 w-20 rounded-lg" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: items }).map((_, i) => (
          <div key={i} className="flex items-start gap-4">
            <ModernSkeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <ModernSkeleton className="h-4 w-full" />
              <ModernSkeleton className="h-3 w-2/3" />
              <ModernSkeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Modern Dashboard Grid Skeleton
 * Complete dashboard loading state
 */
export function ModernDashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ModernStatsCardSkeleton />
        <ModernStatsCardSkeleton />
        <ModernStatsCardSkeleton />
        <ModernStatsCardSkeleton />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          <ModernFinancialHealthSkeleton />
          <ModernTableSkeleton rows={5} columns={5} />
        </div>

        {/* Right Column - 1/3 width */}
        <div className="space-y-6">
          <ModernPendingPaymentsSkeleton />
          <ModernActivityLogSkeleton items={4} />
        </div>
      </div>
    </div>
  );
}
