'use client';

import Link from 'next/link';
import { ChevronRight, Receipt, UserPlus, FileText, Shield, Upload, CheckCircle } from 'lucide-react';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { RecentActivityItem } from '@/actions/dashboard/get-enhanced-dashboard-stats';

interface ModernRecentActivityProps {
  activities: RecentActivityItem[] | null;
  isLoading?: boolean;
}

const activityConfig: Record<RecentActivityItem['type'], {
  icon: React.ElementType;
  color: string;
  bgColor: string;
}> = {
  payment: {
    icon: Receipt,
    color: 'text-[#10B981]',
    bgColor: 'bg-[#10B981]/10',
  },
  resident: {
    icon: UserPlus,
    color: 'text-[#0EA5E9]',
    bgColor: 'bg-[#0EA5E9]/10',
  },
  invoice: {
    icon: FileText,
    color: 'text-[#F59E0B]',
    bgColor: 'bg-[#F59E0B]/10',
  },
  security: {
    icon: Shield,
    color: 'text-[#8B5CF6]',
    bgColor: 'bg-[#8B5CF6]/10',
  },
  import: {
    icon: Upload,
    color: 'text-[#06B6D4]',
    bgColor: 'bg-[#06B6D4]/10',
  },
  approval: {
    icon: CheckCircle,
    color: 'text-[#F43F5E]',
    bgColor: 'bg-[#F43F5E]/10',
  },
};

function ActivitySkeleton() {
  return (
    <div className="rounded-xl border bg-white p-6 dark:bg-[#1E293B] dark:border-[#334155]">
      <div className="mb-4 flex items-center justify-between">
        <ShimmerSkeleton width={120} height={24} speed="fast" />
        <ShimmerSkeleton width={60} height={20} speed="fast" />
      </div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <ShimmerSkeleton width={40} height={40} rounded="lg" speed="fast" />
            <div className="flex-1 space-y-1.5">
              <ShimmerSkeleton width="70%" height={16} speed="fast" />
              <ShimmerSkeleton width="40%" height={12} speed="fast" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Modern Recent Activity Component
 *
 * Displays recent system activities with:
 * - Colored icons for different activity types
 * - Activity description and timestamp
 * - Modern theme styling with generous spacing
 */
export function ModernRecentActivity({ activities, isLoading }: ModernRecentActivityProps) {
  if (isLoading || !activities) {
    return <ActivitySkeleton />;
  }

  return (
    <div className={cn(
      'rounded-xl border bg-white p-6 shadow-sm transition-all duration-200',
      'hover:shadow-md dark:bg-[#1E293B] dark:border-[#334155]'
    )}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Recent Activity
        </h3>
        <Link
          href="/residents" // Or appropriate activity log page
          className="flex items-center gap-1 text-sm font-medium text-[#0EA5E9] hover:text-[#0284C7] transition-colors"
        >
          View All
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Activity List */}
      {activities.length > 0 ? (
        <div className="space-y-3">
          {activities.slice(0, 5).map((activity) => {
            const config = activityConfig[activity.type];
            const Icon = config.icon;
            const timeAgo = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true });

            return (
              <div
                key={activity.id}
                className="flex items-start gap-3 rounded-lg p-3 transition-all duration-200 hover:bg-gray-50 dark:hover:bg-[#0F172A]"
              >
                <div className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  config.bgColor
                )}>
                  <Icon className={cn('h-5 w-5', config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {activity.action}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {activity.description}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {timeAgo}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No Recent Activity
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
            Activity will appear here as residents make payments, new users are added, and other actions occur.
          </p>
        </div>
      )}
    </div>
  );
}
