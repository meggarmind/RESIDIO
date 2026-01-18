'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { Button } from '@/components/ui/button';
import {
    UserPlus,
    CreditCard,
    FileText,
    Upload,
    Home,
    ShieldPlus,
    Zap,
    ChevronRight
} from 'lucide-react';
import type { SecurityAlerts, QuickStats } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface UnifiedActionsCardProps {
    securityAlerts: SecurityAlerts | null;
    quickStats: QuickStats | null;
    unverifiedPaymentsCount?: number;
    isLoading?: boolean;
}

interface QuickAction {
    label: string;
    href: string;
    icon: React.ElementType;
    color: 'emerald' | 'blue' | 'amber' | 'purple' | 'rose' | 'slate';
}

const quickActions: QuickAction[] = [
    {
        label: 'Add Resident',
        href: '/residents/new',
        icon: UserPlus,
        color: 'emerald',
    },
    {
        label: 'Record Payment',
        href: '/payments/new',
        icon: CreditCard,
        color: 'blue',
    },
    {
        label: 'Generate Invoices',
        href: '/billing/generate',
        icon: FileText,
        color: 'amber',
    },
    {
        label: 'Import Statement',
        href: '/payments/import',
        icon: Upload,
        color: 'purple',
    },
    {
        label: 'Add House',
        href: '/houses/new',
        icon: Home,
        color: 'rose',
    },
    {
        label: 'Security Contact',
        href: '/security/contacts/new',
        icon: ShieldPlus,
        color: 'slate',
    },
];

const colorStyles = {
    emerald: {
        bg: 'bg-emerald-500/10 hover:bg-emerald-500/20',
        icon: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-500/20',
    },
    blue: {
        bg: 'bg-blue-500/10 hover:bg-blue-500/20',
        icon: 'text-blue-600 dark:text-blue-400',
        border: 'border-blue-500/20',
    },
    amber: {
        bg: 'bg-amber-500/10 hover:bg-amber-500/20',
        icon: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-500/20',
    },
    purple: {
        bg: 'bg-purple-500/10 hover:bg-purple-500/20',
        icon: 'text-purple-600 dark:text-purple-400',
        border: 'border-purple-500/20',
    },
    rose: {
        bg: 'bg-rose-500/10 hover:bg-rose-500/20',
        icon: 'text-rose-600 dark:text-rose-400',
        border: 'border-rose-500/20',
    },
    slate: {
        bg: 'bg-slate-500/10 hover:bg-slate-500/20',
        icon: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-500/20',
    },
};

function QuickActionButton({ action }: { action: QuickAction }) {
    const styles = colorStyles[action.color];
    const Icon = action.icon;

    return (
        <Link href={action.href} className="group">
            <div className={cn(
                'flex items-center gap-2 rounded-lg border p-2.5 transition-all duration-200',
                'hover:shadow-sm hover:translate-y-[-1px]',
                styles.bg,
                styles.border
            )}>
                <div className={cn('p-1.5 rounded-md shrink-0', styles.bg)}>
                    <Icon className={cn('h-3.5 w-3.5', styles.icon)} />
                </div>
                <p className="text-xs font-medium truncate">{action.label}</p>
            </div>
        </Link>
    );
}

function UnifiedActionsCardSkeleton() {
    return (
        <Card className="h-[270px]">
            <CardHeader className="p-4 pb-3">
                <ShimmerSkeleton width={120} height={20} speed="fast" />
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                    {[...Array(6)].map((_, i) => (
                        <ShimmerSkeleton key={i} height={70} className="w-full rounded-md" speed="normal" />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export function UnifiedActionsCard({
    securityAlerts,
    quickStats,
    unverifiedPaymentsCount = 0,
    isLoading
}: UnifiedActionsCardProps) {
    if (isLoading || !securityAlerts || !quickStats) {
        return <UnifiedActionsCardSkeleton />;
    }

    const pendingVerifications = quickStats.pendingVerification ?? 0;
    const expiringContacts = securityAlerts.expiringCodesCount ?? 0;
    const totalActions = pendingVerifications + unverifiedPaymentsCount + expiringContacts;
    const hasActions = totalActions > 0;

    return (
        <Card className="overflow-hidden relative animate-fade-in-up h-[270px] flex flex-col">
            {/* Alert indicator stripe */}
            {hasActions && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />
            )}

            <CardHeader className="p-4 pb-3 shrink-0">
                <CardTitle className="flex items-center justify-between text-base font-semibold">
                    <div className="flex items-center gap-2">
                        <Zap className={cn(
                            "h-5 w-5",
                            hasActions ? "text-amber-500" : "text-emerald-500"
                        )} />
                        {hasActions ? (
                            <>
                                <AnimatedCounter
                                    value={totalActions}
                                    className={cn(
                                        "text-lg font-bold tabular-nums",
                                        "text-amber-600 dark:text-amber-400"
                                    )}
                                    duration={800}
                                />
                                <span className="text-sm text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                    Need Attention
                                </span>
                            </>
                        ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">All Clear</span>
                        )}
                    </div>
                    <Button variant="ghost" size="sm" asChild className="text-xs h-7 px-2">
                        <Link href="/approvals">
                            View All
                            <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                    </Button>
                </CardTitle>
            </CardHeader>

            <CardContent className="p-4 pt-0 flex-1 flex flex-col overflow-hidden">
                {/* Quick Actions Grid - fills available space */}
                <div className="grid grid-cols-3 gap-2.5 h-full">
                    {quickActions.map((action) => (
                        <QuickActionButton key={action.href} action={action} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
