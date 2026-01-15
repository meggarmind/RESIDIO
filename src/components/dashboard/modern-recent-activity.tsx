'use client';

import Link from 'next/link';
import { ChevronRight, Receipt, UserPlus, FileText, Shield, Upload, CheckCircle, Activity } from 'lucide-react';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import type { RecentActivityItem } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { motion, AnimatePresence } from 'framer-motion';

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

function ActivityListItem({ activity, index }: { activity: RecentActivityItem; index: number }) {
  const config = activityConfig[activity.type];
  const Icon = config.icon;
  const timeAgo = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: 'easeOut' }}
      whileHover={{ scale: 1.01, x: 4 }}
      className="flex items-start gap-4 rounded-xl p-3.5 transition-all duration-300 hover:bg-white/40 dark:hover:bg-white/5 cursor-pointer group shadow-sm hover:shadow-md border border-transparent hover:border-white/20 dark:hover:border-white/5"
    >
      <div className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 shadow-sm',
        config.bgColor
      )}>
        <Icon className={cn('h-5 w-5', config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {activity.action}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
              {activity.description}
            </p>
            <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mt-1 uppercase tracking-wider">
              {timeAgo}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="rounded-2xl border bg-white/60 dark:bg-[#1E293B]/60 backdrop-blur-xl p-8 shadow-xl border-white/20 dark:border-white/5">
      <div className="mb-8 flex items-center justify-between">
        <ShimmerSkeleton width={140} height={28} speed="fast" className="rounded-full" />
        <ShimmerSkeleton width={80} height={24} speed="fast" className="rounded-full" />
      </div>
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <ShimmerSkeleton width={44} height={44} rounded="xl" speed="fast" />
            <div className="flex-1 space-y-2">
              <ShimmerSkeleton width="60%" height={18} speed="fast" className="rounded-md" />
              <ShimmerSkeleton width="40%" height={14} speed="fast" className="rounded-md" />
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
 * Displays recent system activities with high-end Apple design aesthetics:
 * - Deference: Glassmorphism and content-first layout
 * - Clarity: Date grouping and intuitive typography
 * - Depth: Motion-driven interactions and layered shadows
 */
export function ModernRecentActivity({ activities, isLoading }: ModernRecentActivityProps) {
  if (isLoading || !activities) {
    return <ActivitySkeleton />;
  }

  // Group activities by date
  const groupedActivities: Record<string, RecentActivityItem[]> = {};

  activities.forEach(activity => {
    const date = new Date(activity.timestamp);
    let groupLabel = '';

    if (isToday(date)) {
      groupLabel = 'Today';
    } else if (isYesterday(date)) {
      groupLabel = 'Yesterday';
    } else {
      groupLabel = format(date, 'MMMM d, yyyy');
    }

    if (!groupedActivities[groupLabel]) {
      groupedActivities[groupLabel] = [];
    }
    groupedActivities[groupLabel].push(activity);
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className={cn(
        'rounded-2xl border p-8 transition-all duration-500',
        'bg-white/60 dark:bg-zinc-900/40 backdrop-blur-2xl border-white/20 dark:border-white/5',
        'shadow-[0_8px_40px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_60px_rgba(0,0,0,0.12)]'
      )}>
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 shadow-inner">
              <Activity className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                Recent Activity
              </h3>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Real-time updates from your community
              </p>
            </div>
          </div>
          <Link
            href="/settings/audit-logs"
            className="flex items-center gap-2 rounded-full bg-white/40 dark:bg-white/5 px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-white/10 transition-all duration-300 shadow-sm"
          >
            All Logs
            <ChevronRight className="h-3 w-3 opacity-60" />
          </Link>
        </div>

        {/* Activity List */}
        <div className="space-y-8">
          {activities.length > 0 ? (
            Object.entries(groupedActivities).map(([label, items]) => (
              <div key={label} className="space-y-3">
                <div className="flex items-center gap-3 px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500/80">
                    {label}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
                </div>
                <div className="space-y-1">
                  {items.slice(0, 5).map((activity, idx) => (
                    <ActivityListItem
                      key={activity.id}
                      activity={activity}
                      index={idx}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[2.5rem] bg-gray-50 dark:bg-zinc-800/50 shadow-inner border border-white/10">
                <FileText className="h-10 w-10 text-gray-300 dark:text-gray-600" />
              </div>
              <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                All Quiet
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
                We'll notify you here when important actions happen in your dashboard.
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
