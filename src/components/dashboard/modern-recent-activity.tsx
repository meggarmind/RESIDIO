'use client';

import Link from 'next/link';
import { ChevronRight, Receipt, UserPlus, FileText, Shield, Upload, CheckCircle, Activity } from 'lucide-react';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import type { RecentActivityItem } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    color: 'text-status-success',
    bgColor: 'bg-status-success/10',
  },
  resident: {
    icon: UserPlus,
    color: 'text-accent-primary',
    bgColor: 'bg-accent-primary/10',
  },
  invoice: {
    icon: FileText,
    color: 'text-status-warning',
    bgColor: 'bg-status-warning/10',
  },
  security: {
    icon: Shield,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  import: {
    icon: Upload,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
  },
  approval: {
    icon: CheckCircle,
    color: 'text-status-error',
    bgColor: 'bg-status-error/10',
  },
};

function ActivityListItem({ activity, index }: { activity: RecentActivityItem; index: number }) {
  const config = activityConfig[activity.type] || activityConfig.approval;
  const Icon = config.icon;
  const timestamp = new Date(activity.timestamp);
  const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });
  const exactTime = format(timestamp, 'MMM d, yyyy, h:mm a');

  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      className="flex h-full items-start gap-2.5 rounded-md px-1.5 py-2 transition-colors hover:bg-muted/40 group"
    >
      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md shadow-sm border border-transparent group-hover:border-primary/20 transition-colors mt-0.5',
        config.bgColor
      )}>
        <Icon className={cn('h-3.5 w-3.5', config.color)} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-xs font-semibold leading-4 text-foreground transition-colors group-hover:text-primary">
            {activity.action}
          </p>
          <time
            dateTime={activity.timestamp}
            title={exactTime}
            aria-label={`${timeAgo}, ${exactTime}`}
            className="shrink-0 whitespace-nowrap text-[10px] font-medium leading-4 text-muted-foreground"
          >
            {timeAgo}
          </time>
        </div>
        <p className="mt-0.5 whitespace-normal break-words text-[11px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">
          {activity.description}
        </p>
      </div>
    </motion.div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 h-[205px]">
      <div className="mb-4 flex items-center justify-between">
        <ShimmerSkeleton width={90} height={16} speed="fast" />
        <ShimmerSkeleton width={40} height={12} speed="fast" />
      </div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <ShimmerSkeleton width={28} height={28} rounded="md" speed="fast" />
            <div className="flex-1 space-y-1">
              <ShimmerSkeleton width="50%" height={8} speed="fast" />
              <ShimmerSkeleton width="80%" height={6} speed="fast" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ModernRecentActivity({ activities, isLoading }: ModernRecentActivityProps) {
  if (isLoading || !activities) {
    return <ActivitySkeleton />;
  }

  const groupedActivities: Record<string, RecentActivityItem[]> = {};

  activities.forEach(activity => {
    const date = new Date(activity.timestamp);
    let groupLabel = '';

    if (isToday(date)) {
      groupLabel = 'Today';
    } else if (isYesterday(date)) {
      groupLabel = 'Yesterday';
    } else {
      groupLabel = format(date, 'MMM d');
    }

    if (!groupedActivities[groupLabel]) {
      groupedActivities[groupLabel] = [];
    }
    groupedActivities[groupLabel].push(activity);
  });

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 transition-all duration-300 h-[205px] flex flex-col overflow-hidden',
      'shadow-soft hover:shadow-elevated'
    )}>
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <h3 className="text-xs font-bold tracking-tight">Recent activity</h3>
        </div>
        <Link
          href="/settings/audit-logs"
          className="flex min-h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          View audit logs
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      <ScrollArea className="flex-1 min-h-0 -mx-1 px-1 pr-3">
        <div className="space-y-4 pb-2">
          {activities.length > 0 ? (
            Object.entries(groupedActivities).map(([label, items]) => (
              <div key={label} className="space-y-0.5">
                <div className="flex items-center gap-2 px-1 mb-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {label}
                  </span>
                  <div className="h-px flex-1 bg-muted/50" aria-hidden="true" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-1">
                  {items.map((activity, idx) => (
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
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="mb-2 h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">No recent activity.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
