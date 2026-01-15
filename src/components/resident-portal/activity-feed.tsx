'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  FileText,
  Shield,
  Bell,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';

interface ActivityItem {
  id: string;
  type: 'payment' | 'invoice' | 'document' | 'security' | 'system';
  title: string;
  description: string;
  timestamp: Date;
  status?: 'success' | 'pending' | 'info';
}

const activityIcons = {
  payment: CreditCard,
  invoice: FileText,
  document: FileText,
  security: Shield,
  system: Bell,
};

const statusColors = {
  success: 'bg-green-500/10 text-green-500',
  pending: 'bg-amber-500/10 text-amber-500',
  info: 'bg-blue-500/10 text-blue-500',
};

interface ActivityFeedProps {
  activities?: ActivityItem[];
  isLoading?: boolean;
}

function ActivityListItem({ activity, index }: { activity: ActivityItem; index: number }) {
  const Icon = activityIcons[activity.type];
  const timeAgo = formatDistanceToNow(activity.timestamp, { addSuffix: true });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: 'easeOut' }}
      whileHover={{ scale: 1.01, x: 4 }}
      className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/40 dark:hover:bg-white/5 transition-all duration-300 group cursor-pointer border border-transparent hover:border-white/20 dark:hover:border-white/5 shadow-sm hover:shadow-md"
    >
      <div className={cn(
        'p-2 rounded-xl shrink-0 mt-0.5 transition-all duration-300 group-hover:scale-110 shadow-sm',
        statusColors[activity.status || 'info']
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
              {activity.title}
            </p>
            <p className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-1">
              {activity.description}
            </p>
          </div>
          {activity.status === 'success' && (
            <div className="mt-1">
              <CheckCircle className="h-3.5 w-3.5 text-green-500/80" />
            </div>
          )}
        </div>
        <p className="text-[10px] font-medium text-muted-foreground/50 mt-1 uppercase tracking-wider">
          {timeAgo}
        </p>
      </div>
    </motion.div>
  );
}

export function ActivityFeed({ activities = [], isLoading }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <Card className="bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl border-white/20 dark:border-white/5 shadow-xl">
        <CardHeader className="pb-3 px-6 pt-5">
          <CardTitle className="text-base font-bold flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/10">
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-6">
          <div className="space-y-4 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-4 p-3">
                <ShimmerSkeleton width={36} height={36} rounded="xl" speed="fast" />
                <div className="flex-1 space-y-2">
                  <ShimmerSkeleton height={16} className="w-3/4 rounded-md" speed="fast" />
                  <ShimmerSkeleton height={12} className="w-1/2 rounded-md" speed="fast" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group activities by date
  const groupedActivities: Record<string, ActivityItem[]> = {};

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
      <Card className="bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl border-white/20 dark:border-white/5 shadow-xl overflow-hidden">
        <CardHeader className="pb-3 px-6 pt-5">
          <CardTitle className="text-base font-bold flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-500/10">
                <Clock className="h-4 w-4 text-blue-500" />
              </div>
              <span>Recent Activity</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-6">
          <div className="space-y-6 pt-2">
            {activities.length > 0 ? (
              Object.entries(groupedActivities).map(([label, items]) => (
                <div key={label} className="space-y-2">
                  <div className="flex items-center gap-3 px-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-500/70">
                      {label}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-blue-500/20 to-transparent" />
                  </div>
                  <div className="space-y-1">
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
              <div className="flex flex-col items-center justify-center py-12 text-center p-6">
                <div className="p-5 rounded-3xl bg-muted/20 backdrop-blur-sm shadow-inner mb-4">
                  <Clock className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-semibold">Quiet for now</p>
                <p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">
                  Your account activity and updates will appear here
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
