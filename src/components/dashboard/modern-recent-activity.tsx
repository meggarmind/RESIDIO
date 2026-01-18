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
  const timeAgo = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true });

  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      className="flex items-start gap-2.5 py-1.5 px-1.5 rounded-md transition-all hover:bg-muted/40 cursor-pointer group h-full"
    >
      <div className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md shadow-sm border border-transparent group-hover:border-primary/20 transition-colors mt-0.5',
        config.bgColor
      )}>
        <Icon className={cn('h-3 w-3', config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-foreground truncate group-hover:text-primary transition-colors">
            {activity.action}
          </p>
          <span className="text-[9px] font-medium text-muted-foreground whitespace-nowrap opacity-60">
            {timeAgo}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground opacity-80 leading-tight break-all whitespace-normal">
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
      {/* Header */}
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-bold tracking-tight uppercase">Audit Pulse</h3>
        </div>
        <Link
          href="/settings/audit-logs"
          className="flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors"
        >
          Logs
          <ChevronRight className="h-2.5 w-2.5" />
        </Link>
      </div>

      {/* Activity List with ScrollArea */}
      <ScrollArea className="flex-1 min-h-0 -mx-1 px-1 pr-3">
        <div className="space-y-4 pb-2">
          {activities.length > 0 ? (
            Object.entries(groupedActivities).map(([label, items]) => (
              <div key={label} className="space-y-0.5">
                <div className="flex items-center gap-2 px-1 mb-1.5">
                  <span className="text-[8px] font-black uppercase tracking-widest text-primary/40">
                    {label}
                  </span>
                  <div className="h-px flex-1 bg-muted/50" />
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
              <FileText className="h-6 w-6 text-muted-foreground/20 mb-2" />
              <p className="text-[10px] text-muted-foreground">No events found.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
