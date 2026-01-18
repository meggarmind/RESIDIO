'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { StatusBadge } from '@/components/ui/status-badge';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Shield,
    ShieldAlert,
    Clock,
    UserX,
    AlertOctagon,
    ChevronRight,
    CheckCircle2
} from 'lucide-react';
import type { SecurityAlerts } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface SecurityAlertsCardProps {
    securityAlerts: SecurityAlerts | null;
    isLoading?: boolean;
    compact?: boolean;
}

function AlertBadge({ count, label, variant, compact }: { count: number; label: string; variant: 'warning' | 'danger' | 'muted'; compact?: boolean }) {
    const variantStyles = {
        warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        danger: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
        muted: 'bg-muted text-muted-foreground border-transparent',
    };

    return (
        <div className={cn(
            'flex items-center gap-2 rounded-lg border transition-colors',
            compact ? "px-2 py-1.5" : "px-3 py-2",
            count > 0 ? variantStyles[variant] : variantStyles.muted
        )}>
            <AnimatedCounter
                value={count}
                className={cn("font-bold tabular-nums", compact ? "text-lg" : "text-xl")}
                duration={600}
            />
            <span className={cn("text-xs truncate", compact ? "max-w-[40px] sm:max-w-none" : "")}>{label}</span>
        </div>
    );
}

function ExpiringCodeItem({ code, contactName, residentName, validUntil, compact }: {
    code: string;
    contactName: string;
    residentName: string;
    validUntil: string;
    compact?: boolean;
}) {
    const expiresIn = formatDistanceToNow(new Date(validUntil), { addSuffix: true });

    return (
        <div className={cn(
            "flex items-center gap-3 rounded-md hover:bg-muted/50 transition-colors group",
            compact ? "p-1.5" : "p-2"
        )}>
            <div className="p-1.5 rounded-md bg-amber-500/10">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{contactName}</p>
                <p className="text-xs text-muted-foreground truncate">
                    <span className="font-mono">{code}</span>
                </p>
            </div>
            {!compact && (
                <StatusBadge variant="warning" size="sm">
                    {expiresIn}
                </StatusBadge>
            )}
        </div>
    );
}

function SecurityAlertsSkeleton({ compact }: { compact?: boolean }) {
    return (
        <Card>
            <CardHeader className={compact ? "p-4 pb-2" : "pb-3"}>
                <ShimmerSkeleton width={128} height={20} speed="fast" />
            </CardHeader>
            <CardContent className={cn("space-y-4", compact ? "p-4 pt-0" : "")}>
                <div className="flex gap-2">
                    {[...Array(2)].map((_, i) => (
                        <ShimmerSkeleton key={i} height={compact ? 40 : 48} className="flex-1 rounded-lg" speed="fast" />
                    ))}
                </div>
                <div className="space-y-2">
                    {[...Array(compact ? 2 : 3)].map((_, i) => (
                        <ShimmerSkeleton key={i} height={compact ? 40 : 48} className="w-full rounded-md" speed="normal" />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export function SecurityAlertsCard({ securityAlerts, isLoading, compact }: SecurityAlertsCardProps) {
    if (isLoading || !securityAlerts) {
        return <SecurityAlertsSkeleton compact={compact} />;
    }

    const {
        expiringCodesCount,
        expiredCodesCount,
        suspendedContactsCount,
        recentFlaggedEntries,
        expiringCodes
    } = securityAlerts;

    const hasAlerts = expiringCodesCount > 0 || expiredCodesCount > 0 || suspendedContactsCount > 0 || recentFlaggedEntries > 0;

    return (
        <Card className="overflow-hidden relative animate-fade-in-up h-full">
            {/* Alert indicator stripe */}
            {hasAlerts && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 via-red-500 to-amber-500" />
            )}

            <CardHeader className={compact ? "p-4 pb-2" : "pb-3"}>
                <CardTitle className="flex items-center justify-between text-base font-semibold">
                    <div className="flex items-center gap-2">
                        {hasAlerts ? (
                            <ShieldAlert className="h-5 w-5 text-amber-500" />
                        ) : (
                            <Shield className="h-5 w-5 text-emerald-500" />
                        )}
                        {compact ? "Security" : "Security Alerts"}
                    </div>
                    {!compact && (
                        <Button variant="ghost" size="sm" asChild className="text-xs h-7 px-2">
                            <Link href="/security">
                                View All
                                <ChevronRight className="h-3.5 w-3.5 ml-1" />
                            </Link>
                        </Button>
                    )}
                </CardTitle>
            </CardHeader>

            <CardContent className={cn("space-y-4", compact ? "p-4 pt-0" : "")}>
                {/* Alert Counts */}
                <div className={cn(
                    "grid gap-2",
                    compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"
                )}>
                    <AlertBadge count={expiringCodesCount} label="Expiring" variant="warning" compact={compact} />
                    <AlertBadge count={expiredCodesCount} label="Expired" variant="danger" compact={compact} />
                    {!compact && (
                        <>
                            <AlertBadge count={suspendedContactsCount} label="Suspended" variant="warning" compact={compact} />
                            <AlertBadge count={recentFlaggedEntries} label="Flagged" variant="danger" compact={compact} />
                        </>
                    )}
                </div>

                {/* Expiring Codes List */}
                {expiringCodes.length > 0 ? (
                    <div className="space-y-1">
                        {!compact && (
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                Expiring Access Codes
                            </p>
                        )}
                        <ScrollArea className={compact ? "h-[100px]" : "h-[140px]"}>
                            <div className="space-y-1">
                                {expiringCodes.slice(0, compact ? 4 : undefined).map((code) => (
                                    <ExpiringCodeItem
                                        key={code.id}
                                        code={code.code}
                                        contactName={code.contactName}
                                        residentName={code.residentName}
                                        validUntil={code.validUntil}
                                        compact={compact}
                                    />
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                ) : hasAlerts ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                        <AlertOctagon className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                            Review in Security
                        </p>
                    </div>
                ) : (
                    <div className={cn(
                        "flex items-center gap-3 rounded-lg border",
                        compact ? "p-3 bg-emerald-500/5 border-emerald-500/10" : "p-4 bg-emerald-500/5 border-emerald-500/10"
                    )}>
                        <div className="p-2 rounded-full bg-emerald-500/10">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                All Clear
                            </p>
                            {!compact && (
                                <p className="text-xs text-muted-foreground">
                                    No alerts at this time
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
