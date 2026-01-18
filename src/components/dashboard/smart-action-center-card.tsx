'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { Button } from '@/components/ui/button';
import {
    AlertCircle,
    UserCheck,
    Receipt,
    Clock,
    ChevronRight,
    Zap
} from 'lucide-react';
import type { SecurityAlerts, QuickStats } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface SmartActionCenterCardProps {
    securityAlerts: SecurityAlerts | null;
    quickStats: QuickStats | null;
    unverifiedPaymentsCount?: number;
    isLoading?: boolean;
    compact?: boolean;
}

function ActionItem({ icon: Icon, label, count, color }: { icon: any; label: string; count: number; color: string }) {
    return (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className={cn("p-1.5 rounded-md", color)}>
                <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate">{label}</p>
            </div>
            <AnimatedCounter
                value={count}
                className="text-sm font-bold tabular-nums"
                duration={600}
            />
        </div>
    );
}

function SmartActionCenterSkeleton({ compact }: { compact?: boolean }) {
    return (
        <Card>
            <CardHeader className={compact ? "p-4 pb-2" : "pb-3"}>
                <ShimmerSkeleton width={160} height={20} speed="fast" />
            </CardHeader>
            <CardContent className={cn("space-y-3", compact ? "p-4 pt-0" : "")}>
                <ShimmerSkeleton height={60} className="w-full rounded-lg" speed="fast" />
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                        <ShimmerSkeleton key={i} height={40} className="w-full rounded-md" speed="normal" />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export function SmartActionCenterCard({
    securityAlerts,
    quickStats,
    unverifiedPaymentsCount = 0,
    isLoading,
    compact
}: SmartActionCenterCardProps) {
    if (isLoading || !securityAlerts || !quickStats) {
        return <SmartActionCenterSkeleton compact={compact} />;
    }

    const pendingVerifications = quickStats.pendingVerification ?? 0;
    const expiringContacts = securityAlerts.expiringCodesCount ?? 0;
    const totalActions = pendingVerifications + unverifiedPaymentsCount + expiringContacts;

    const hasActions = totalActions > 0;

    return (
        <Card className="overflow-hidden relative animate-fade-in-up h-full">
            {/* Alert indicator stripe */}
            {hasActions && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />
            )}

            <CardHeader className={compact ? "p-4 pb-2" : "pb-3"}>
                <CardTitle className="flex items-center justify-between text-base font-semibold">
                    <div className="flex items-center gap-2">
                        <Zap className={cn(
                            "h-5 w-5",
                            hasActions ? "text-amber-500" : "text-emerald-500"
                        )} />
                        {compact ? "Actions" : "Smart Action Center"}
                    </div>
                    {!compact && (
                        <Button variant="ghost" size="sm" asChild className="text-xs h-7 px-2">
                            <Link href="/approvals">
                                View All
                                <ChevronRight className="h-3.5 w-3.5 ml-1" />
                            </Link>
                        </Button>
                    )}
                </CardTitle>
            </CardHeader>

            <CardContent className={cn("space-y-4", compact ? "p-4 pt-0" : "")}>
                {/* Total Actions Count */}
                <div className={cn(
                    "flex flex-col items-center justify-center rounded-xl border p-4 transition-all",
                    hasActions
                        ? "bg-amber-500/5 border-amber-500/20"
                        : "bg-emerald-500/5 border-emerald-500/20"
                )}>
                    <div className="flex items-baseline gap-2 mb-1">
                        <AnimatedCounter
                            value={totalActions}
                            className={cn(
                                "text-4xl font-bold tabular-nums",
                                hasActions ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                            )}
                            duration={800}
                        />
                        <span className="text-sm text-muted-foreground">
                            {totalActions === 1 ? 'item' : 'items'}
                        </span>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {hasActions ? 'Need Attention' : 'All Clear'}
                    </p>
                </div>

                {/* Action Breakdown */}
                {hasActions ? (
                    <div className="space-y-1.5">
                        {pendingVerifications > 0 && (
                            <ActionItem
                                icon={UserCheck}
                                label="Pending Verifications"
                                count={pendingVerifications}
                                color="bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            />
                        )}
                        {unverifiedPaymentsCount > 0 && (
                            <ActionItem
                                icon={Receipt}
                                label="Unverified Payments"
                                count={unverifiedPaymentsCount}
                                color="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            />
                        )}
                        {expiringContacts > 0 && (
                            <ActionItem
                                icon={Clock}
                                label="Expiring Contacts"
                                count={expiringContacts}
                                color="bg-orange-500/10 text-orange-600 dark:text-orange-400"
                            />
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                        <AlertCircle className="h-4 w-4 text-emerald-500" />
                        <p className="text-sm text-muted-foreground">
                            No pending actions
                        </p>
                    </div>
                )}

                {/* CTA Button */}
                {hasActions && (
                    <Button
                        asChild
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                        size="sm"
                    >
                        <Link href="/approvals">
                            <Zap className="h-4 w-4 mr-2" />
                            Take Action
                        </Link>
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
