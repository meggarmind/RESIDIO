'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    RefreshCw,
    XCircle,
    Activity,
    ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { POLLING_INTERVALS } from '@/lib/config/polling';
import { getCronStatus } from '@/actions/system/cron-status';
import type { HealthResponse } from '@/lib/system/cron-status';

type CronHealthResponse = HealthResponse;

async function fetchCronHealth(): Promise<CronHealthResponse> {
    // Goes through the authorized server action rather than fetching
    // `/api/health/cron-status` directly from the client: that route is
    // guarded by SYSTEM_MONITOR and returns full cron job status (including
    // Gmail connection state) via the service-role client, so it must not be
    // reachable as a plain client-side fetch. See issue #174.
    const result = await getCronStatus();

    if (result.error || !result.data) {
        throw new Error(result.error || 'Failed to fetch cron health');
    }

    return result.data;
}

function getStatusIcon(status: string) {
    switch (status) {
        case 'healthy':
            return <CheckCircle2 className="h-4 w-4 text-green-500" />;
        case 'warning':
            return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
        case 'critical':
            return <XCircle className="h-4 w-4 text-red-500" />;
        default:
            return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (status) {
        case 'healthy':
            return 'default';
        case 'warning':
            return 'secondary';
        case 'critical':
            return 'destructive';
        default:
            return 'outline';
    }
}

export function CronHealthCard() {
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false,
    );
    const {
        data,
        isLoading,
        error,
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ['cron-health'],
        queryFn: fetchCronHealth,
        refetchInterval: POLLING_INTERVALS.STANDARD,
        staleTime: POLLING_INTERVALS.REALTIME,
        enabled: mounted, // Only run after mount to avoid hydration mismatch
    });

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        <div>
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-4 w-48 mt-1" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="border-destructive/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                        <XCircle className="h-5 w-5" />
                        System Health Error
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Unable to fetch system health status. Check server logs.
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => refetch()}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const overallStatus = data?.status || (data as { overall?: string }).overall || 'unknown';
    const jobs = data?.jobs || [];
    const lastChecked = data?.lastChecked || (data as { timestamp?: string }).timestamp;

    // Filter to show only critical jobs first, then by importance
    const prioritizedJobs = [...jobs].sort((a, b) => {
        const statusOrder = { critical: 0, warning: 1, unknown: 2, healthy: 3 };
        return (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3);
    });

    return (
        <Card className={cn(
            overallStatus === 'critical' && 'border-destructive/50',
            overallStatus === 'warning' && 'border-yellow-500/50',
        )}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                    <Activity className={cn(
                        'h-5 w-5',
                        overallStatus === 'healthy' && 'text-green-500',
                        overallStatus === 'warning' && 'text-yellow-500',
                        overallStatus === 'critical' && 'text-red-500',
                    )} />
                    <div>
                        <CardTitle className="text-base">System Health</CardTitle>
                        <CardDescription>Automated task status</CardDescription>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={getStatusBadgeVariant(overallStatus)}>
                        {getStatusIcon(overallStatus)}
                        <span className="ml-1 capitalize">{overallStatus}</span>
                    </Badge>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {prioritizedJobs.slice(0, 4).map((job) => (
                        <div
                            key={job.name}
                            className={cn(
                                'flex items-center justify-between p-2 rounded-lg border',
                                job.status === 'critical' && 'bg-destructive/5 border-destructive/30',
                                job.status === 'warning' && 'bg-yellow-500/5 border-yellow-500/30',
                                job.status === 'healthy' && 'bg-muted/30',
                            )}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                {getStatusIcon(job.status)}
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{job.description}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {job.message}
                                    </p>
                                </div>
                            </div>
                            <div className="text-xs text-muted-foreground text-right shrink-0 ml-2">
                                {job.lastRunRelative}
                            </div>
                        </div>
                    ))}
                </div>

                {jobs.length > 4 && (
                    <Link href="/system/cron-status">
                        <Button variant="ghost" size="sm" className="w-full mt-3">
                            View Detailed Status
                            <ExternalLink className="h-4 w-4 ml-2" />
                        </Button>
                    </Link>
                )}

                {lastChecked && (
                    <p className="text-xs text-muted-foreground text-center mt-3">
                        Last checked: {new Date(lastChecked).toLocaleTimeString()}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
