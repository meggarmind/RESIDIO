'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
}

function AlertBadge({ count, label, variant }: { count: number; label: string; variant: 'warning' | 'danger' | 'muted' }) {
    const variantStyles = {
        warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        danger: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
        muted: 'bg-muted text-muted-foreground border-transparent',
    };

    return (
        <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
            count > 0 ? variantStyles[variant] : variantStyles.muted
        )}>
            <span className="text-xl font-bold tabular-nums">{count}</span>
            <span className="text-xs">{label}</span>
        </div>
    );
}

function ExpiringCodeItem({ code, contactName, residentName, validUntil }: {
    code: string;
    contactName: string;
    residentName: string;
    validUntil: string;
}) {
    const expiresIn = formatDistanceToNow(new Date(validUntil), { addSuffix: true });

    return (
        <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors group">
            <div className="p-1.5 rounded-md bg-amber-500/10">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{contactName}</p>
                <p className="text-xs text-muted-foreground truncate">
                    {residentName} • <span className="font-mono">{code}</span>
                </p>
            </div>
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 shrink-0">
                {expiresIn}
            </Badge>
        </div>
    );
}

function SecurityAlertsSkeleton() {
    return (
        <Card>
            <CardHeader className="pb-3">
                <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-12 flex-1 rounded-lg" />
                    ))}
                </div>
                <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-md" />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export function SecurityAlertsCard({ securityAlerts, isLoading }: SecurityAlertsCardProps) {
    if (isLoading || !securityAlerts) {
        return <SecurityAlertsSkeleton />;
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
        <Card className="overflow-hidden relative">
            {/* Alert indicator stripe */}
            {hasAlerts && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 via-red-500 to-amber-500" />
            )}

            <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base font-semibold">
                    <div className="flex items-center gap-2">
                        {hasAlerts ? (
                            <ShieldAlert className="h-5 w-5 text-amber-500" />
                        ) : (
                            <Shield className="h-5 w-5 text-emerald-500" />
                        )}
                        Security Alerts
                    </div>
                    <Button variant="ghost" size="sm" asChild className="text-xs h-7 px-2">
                        <Link href="/security">
                            View All
                            <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                    </Button>
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Alert Counts */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <AlertBadge count={expiringCodesCount} label="Expiring Soon" variant="warning" />
                    <AlertBadge count={expiredCodesCount} label="Expired" variant="danger" />
                    <AlertBadge count={suspendedContactsCount} label="Suspended" variant="warning" />
                    <AlertBadge count={recentFlaggedEntries} label="Flagged (7d)" variant="danger" />
                </div>

                {/* Expiring Codes List */}
                {expiringCodes.length > 0 ? (
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Expiring Access Codes
                        </p>
                        <ScrollArea className="h-[140px]">
                            <div className="space-y-1">
                                {expiringCodes.map((code) => (
                                    <ExpiringCodeItem
                                        key={code.id}
                                        code={code.code}
                                        contactName={code.contactName}
                                        residentName={code.residentName}
                                        validUntil={code.validUntil}
                                    />
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                ) : hasAlerts ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                        <AlertOctagon className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                            Review alerts in the Security module
                        </p>
                    </div>
                ) : (
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                        <div className="p-2 rounded-full bg-emerald-500/10">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                All Clear
                            </p>
                            <p className="text-xs text-muted-foreground">
                                No security alerts at this time
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
