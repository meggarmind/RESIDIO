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
import { formatDistanceToNow } from 'date-fns';

interface RecentActivityCardProps {
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
        color: 'text-emerald-600 dark:text-emerald-400',
        bgColor: 'bg-emerald-500/10',
    },
    resident: {
        icon: UserPlus,
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-500/10',
    },
    invoice: {
        icon: FileText,
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-500/10',
    },
    security: {
        icon: Shield,
        color: 'text-purple-600 dark:text-purple-400',
        bgColor: 'bg-purple-500/10',
    },
    import: {
        icon: Upload,
        color: 'text-cyan-600 dark:text-cyan-400',
        bgColor: 'bg-cyan-500/10',
    },
    approval: {
        icon: CheckCircle,
        color: 'text-rose-600 dark:text-rose-400',
        bgColor: 'bg-rose-500/10',
    },
};

function formatCurrency(amount: number): string {
    return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function ActivityListItem({ activity }: { activity: RecentActivityItem }) {
    const config = activityConfig[activity.type];
    const Icon = config.icon;
    const timeAgo = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true });

    return (
        <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-all duration-200 group">
            <div className={cn(
                'p-1.5 rounded-lg shrink-0 mt-0.5 transition-transform duration-200 group-hover:scale-110',
                config.bgColor
            )}>
                <Icon className={cn('h-3.5 w-3.5', config.color)} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-sm leading-tight">
                            {activity.actorName && (
                                <span className="font-medium">{activity.actorName}</span>
                            )}
                            {activity.actorName && ' '}
                            <span className="text-muted-foreground">{activity.description}</span>
                        </p>
                        {(activity.entityName || activity.amount) && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {activity.entityName}
                                {activity.entityName && activity.amount && ' • '}
                                {activity.amount && (
                                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(activity.amount)}
                                    </span>
                                )}
                            </p>
                        )}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {timeAgo}
                    </span>
                </div>
            </div>
        </div>
    );
}

function RecentActivitySkeleton() {
    return (
        <Card>
            <CardHeader className="pb-3">
                <ShimmerSkeleton width={128} height={20} speed="fast" />
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-start gap-3 p-2.5">
                            <ShimmerSkeleton width={28} height={28} rounded="lg" speed="fast" />
                            <div className="flex-1 space-y-1.5">
                                <ShimmerSkeleton height={16} className="w-full" speed="normal" />
                                <ShimmerSkeleton height={12} className="w-2/3" speed="normal" />
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

    return (
        <Card className="flex flex-col h-full animate-fade-in-up">
            <CardHeader className="pb-3 shrink-0">
                <CardTitle className="flex items-center justify-between text-base font-semibold">
                    <div className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-blue-500" />
                        Recent Activity
                    </div>
                    <Button variant="ghost" size="sm" asChild className="text-xs h-7 px-2">
                        <Link href="/settings/audit-logs">
                            All Logs
                            <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden pt-0">
                {activities.length > 0 ? (
                    <ScrollArea className="h-[280px]">
                        <div className="space-y-1">
                            {activities.map((activity) => (
                                <ActivityListItem key={activity.id} activity={activity} />
                            ))}
                        </div>
                    </ScrollArea>
                ) : (
                    <div className="flex flex-col items-center justify-center h-[200px] text-center">
                        <div className="p-3 rounded-full bg-muted/50 mb-3">
                            <Activity className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">No recent activity</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Activity will appear here as changes are made
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
