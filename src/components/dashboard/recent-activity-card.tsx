'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
    Activity,
    Receipt,
    UserPlus,
    FileText,
    Shield,
    Upload,
    CheckCircle,
    ChevronRight
} from 'lucide-react';
import type { RecentActivityItem } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface RecentActivityCardProps {
    activities: RecentActivityItem[] | null;
    isLoading?: boolean;
}

const activityConfig: Record<RecentActivityItem['type'], {
    icon: React.ElementType;
    color: string;
    bgColor: string;
    labelColor: string;
}> = {
    payment: {
        icon: Receipt,
        color: 'text-emerald-500',
        bgColor: 'bg-emerald-500/10',
        labelColor: 'bg-emerald-500/5',
    },
    resident: {
        icon: UserPlus,
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/10',
        labelColor: 'bg-blue-500/5',
    },
    invoice: {
        icon: FileText,
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
        labelColor: 'bg-amber-500/5',
    },
    security: {
        icon: Shield,
        color: 'text-purple-500',
        bgColor: 'bg-purple-500/10',
        labelColor: 'bg-purple-500/5',
    },
    import: {
        icon: Upload,
        color: 'text-cyan-500',
        bgColor: 'bg-cyan-500/10',
        labelColor: 'bg-cyan-500/5',
    },
    approval: {
        icon: CheckCircle,
        color: 'text-rose-500',
        bgColor: 'bg-rose-500/10',
        labelColor: 'bg-rose-500/5',
    },
};

function formatCurrency(amount: number): string {
    return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

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
            className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/40 dark:hover:bg-white/5 transition-all duration-300 group cursor-pointer relative overflow-hidden"
        >
            <div className={cn(
                'p-2 rounded-xl shrink-0 mt-0.5 transition-all duration-300 group-hover:scale-110 shadow-sm group-hover:shadow-md',
                config.bgColor
            )}>
                <Icon className={cn('h-4 w-4', config.color)} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-sm leading-snug font-normal text-foreground/90">
                            {activity.actorName && (
                                <span className="font-semibold text-foreground">{activity.actorName}</span>
                            )}
                            {activity.actorName && ' '}
                            <span className="text-muted-foreground/90">{activity.description}</span>
                        </p>
                        {(activity.entityName || activity.amount) && (
                            <p className="text-[12px] text-muted-foreground/70 mt-1 flex items-center gap-1.5 truncate">
                                <span className="truncate">{activity.entityName}</span>
                                {activity.entityName && activity.amount && <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />}
                                {activity.amount && (
                                    <span className="font-medium text-emerald-600/90 dark:text-emerald-400/90">
                                        {formatCurrency(activity.amount)}
                                    </span>
                                )}
                            </p>
                        )}
                    </div>
                    <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap shrink-0 mt-0.5">
                        {timeAgo}
                    </span>
                </div>
            </div>
        </motion.div>
    );
}

function RecentActivitySkeleton() {
    return (
        <Card variant="list" className="bg-background/60 backdrop-blur-xl border-white/20 dark:border-white/10 shadow-xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-white/10">
                <ShimmerSkeleton width={128} height={20} speed="fast" className="rounded-full" />
            </CardHeader>
            <CardContent className="pt-4">
                <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-start gap-4 p-2">
                            <ShimmerSkeleton width={36} height={36} rounded="xl" speed="fast" />
                            <div className="flex-1 space-y-2">
                                <ShimmerSkeleton height={16} className="w-full rounded-md" speed="normal" />
                                <ShimmerSkeleton height={12} className="w-2/3 rounded-md" speed="normal" />
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export function RecentActivityCard({ activities, isLoading }: RecentActivityCardProps) {
    if (isLoading || !activities) {
        return <RecentActivitySkeleton />;
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
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full"
        >
            <Card variant="list" className={cn(
                "flex flex-col h-full overflow-hidden transition-all duration-500",
                "bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl border-white/20 dark:border-white/5",
                "shadow-[0_8px_32px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_48px_rgba(0,0,0,0.12)]"
            )}>
                <CardHeader className="pb-3 shrink-0 pt-5 px-6">
                    <CardTitle className="flex items-center justify-between text-base font-bold tracking-tight">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-blue-500/10 shadow-inner">
                                <Activity className="h-4.5 w-4.5 text-blue-500 animate-pulse-slow" />
                            </div>
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                                Recent Activity
                            </span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="text-[11px] h-7 px-3 bg-white/40 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 rounded-full transition-all duration-300 font-medium"
                        >
                            <Link href="/settings/audit-logs">
                                All Logs
                                <ChevronRight className="h-3 w-3 ml-1.5 opacity-60" />
                            </Link>
                        </Button>
                    </CardTitle>
                </CardHeader>

                <CardContent className="flex-1 overflow-hidden pt-1 px-3 pb-4">
                    {activities.length > 0 ? (
                        <ScrollArea className="h-[320px] pr-3">
                            <div className="space-y-6 pt-2 px-1">
                                {Object.entries(groupedActivities).map(([label, items]) => (
                                    <div key={label} className="space-y-2">
                                        <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60 px-3 flex items-center gap-2">
                                            {label}
                                            <div className="h-[1px] flex-1 bg-gradient-to-r from-muted-foreground/20 to-transparent" />
                                        </h4>
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
                                ))}
                            </div>
                        </ScrollArea>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[280px] text-center p-6 space-y-4">
                            <div className="p-5 rounded-3xl bg-muted/20 backdrop-blur-sm shadow-inner overflow-hidden border border-white/10">
                                <motion.div
                                    animate={{ rotate: [0, 10, -10, 0] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                >
                                    <Activity className="h-10 w-10 text-muted-foreground/40" />
                                </motion.div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground/80">Quiet in the community</p>
                                <p className="text-xs text-muted-foreground/60 max-w-[200px] leading-relaxed">
                                    Activity will appear here as updates and interactions occur.
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
}
