'use client';

import { Card, CardContent } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import {
    Home,
    Users,
    Shield,
    CheckCircle,
    Clock,
    Building
} from 'lucide-react';
import type { QuickStats } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { cn } from '@/lib/utils';

interface QuickStatsCardProps {
    quickStats: QuickStats | null;
    isLoading?: boolean;
}

interface StatItemProps {
    label: string;
    value: number;
    subLabel?: string;
    subValue?: number;
    icon: React.ElementType;
    color: 'emerald' | 'blue' | 'amber' | 'purple' | 'slate';
}

const colorStyles = {
    emerald: {
        bg: 'bg-emerald-500/10',
        icon: 'text-emerald-600 dark:text-emerald-400',
        ring: 'ring-emerald-500/20',
    },
    blue: {
        bg: 'bg-blue-500/10',
        icon: 'text-blue-600 dark:text-blue-400',
        ring: 'ring-blue-500/20',
    },
    amber: {
        bg: 'bg-amber-500/10',
        icon: 'text-amber-600 dark:text-amber-400',
        ring: 'ring-amber-500/20',
    },
    purple: {
        bg: 'bg-purple-500/10',
        icon: 'text-purple-600 dark:text-purple-400',
        ring: 'ring-purple-500/20',
    },
    slate: {
        bg: 'bg-slate-500/10',
        icon: 'text-slate-600 dark:text-slate-400',
        ring: 'ring-slate-500/20',
    },
};

function StatItem({ label, value, subLabel, subValue, icon: Icon, color }: StatItemProps) {
    const styles = colorStyles[color];

    return (
        <div className="group flex items-center gap-3 p-3 transition-all duration-200 hover:bg-accent/50">
            <div className={cn(
                'p-2.5 rounded-xl shrink-0 ring-1 transition-all duration-200',
                'group-hover:scale-110 group-hover:ring-2',
                styles.bg,
                styles.ring
            )}>
                <Icon className={cn('h-5 w-5', styles.icon)} />
            </div>
            <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                    <AnimatedCounter
                        value={value}
                        className="text-2xl font-bold"
                        duration={800}
                    />
                    {subValue !== undefined && (
                        <>
                            <span className="text-sm text-muted-foreground">/</span>
                            <AnimatedCounter
                                value={subValue}
                                className="text-sm text-muted-foreground"
                                duration={800}
                            />
                        </>
                    )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                    {label}
                    {subLabel && (
                        <span className="text-muted-foreground/60"> • {subLabel}</span>
                    )}
                </p>
            </div>
        </div>
    );
}

function QuickStatsSkeleton() {
    return (
        <Card>
            <CardContent className="p-0">
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-3">
                            <ShimmerSkeleton width={44} height={44} rounded="lg" speed="fast" />
                            <div className="space-y-1.5 flex-1">
                                <ShimmerSkeleton width={48} height={24} speed="fast" />
                                <ShimmerSkeleton width={80} height={12} speed="fast" />
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export function QuickStatsCard({ quickStats, isLoading }: QuickStatsCardProps) {
    if (isLoading || !quickStats) {
        return <QuickStatsSkeleton />;
    }

    const {
        totalHouses,
        occupiedHouses,
        vacantHouses,
        totalResidents,
        activeResidents,
        pendingVerification,
        activeSecurityContacts,
        totalSecurityContacts
    } = quickStats;

    return (
        <Card className="overflow-hidden animate-fade-in-up">
            <CardContent className="p-0">
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border/50">
                    <StatItem
                        label="Properties"
                        value={occupiedHouses}
                        subValue={totalHouses}
                        subLabel={`${vacantHouses} vacant`}
                        icon={Home}
                        color="blue"
                    />
                    <StatItem
                        label="Residents"
                        value={activeResidents}
                        subValue={totalResidents}
                        subLabel="active"
                        icon={Users}
                        color="emerald"
                    />
                    <StatItem
                        label="Pending Verification"
                        value={pendingVerification}
                        icon={Clock}
                        color="amber"
                    />
                    <StatItem
                        label="Security Contacts"
                        value={activeSecurityContacts}
                        subValue={totalSecurityContacts}
                        icon={Shield}
                        color="purple"
                    />
                </div>
            </CardContent>
        </Card>
    );
}
