'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, ArrowUpRight, ArrowDownRight, CircleDollarSign } from 'lucide-react';
import type { FinancialHealthMetrics } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { cn } from '@/lib/utils';

interface FinancialHealthCardProps {
    financialHealth: FinancialHealthMetrics | null;
    isLoading?: boolean;
}

function formatCurrency(amount: number): string {
    return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// SVG Progress Arc Component
function CollectionRateArc({ rate, size = 140 }: { rate: number; size?: number }) {
    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clampedRate = Math.min(Math.max(rate, 0), 100);
    const strokeDashoffset = circumference - (clampedRate / 100) * circumference;

    // Color based on rate
    const getColor = () => {
        if (clampedRate >= 80) return { stroke: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
        if (clampedRate >= 60) return { stroke: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
        return { stroke: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
    };

    const colors = getColor();

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                className="transform -rotate-90"
            >
                {/* Background arc */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-muted/20"
                />
                {/* Foreground arc with gradient */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={colors.stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-1000 ease-out"
                    style={{
                        filter: 'drop-shadow(0 0 6px ' + colors.stroke + '40)',
                    }}
                />
            </svg>
            {/* Center content */}
            <div
                className="absolute inset-0 flex flex-col items-center justify-center"
                style={{ backgroundColor: colors.bg, borderRadius: '50%', margin: strokeWidth / 2 }}
            >
                <span
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: colors.stroke }}
                >
                    {clampedRate.toFixed(0)}%
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    Collection
                </span>
            </div>
        </div>
    );
}

function MetricItem({
    label,
    value,
    icon: Icon,
    trend,
    trendValue,
    variant = 'default',
    badge
}: {
    label: string;
    value: string;
    icon: React.ElementType;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    variant?: 'default' | 'danger' | 'success' | 'warning';
    badge?: { label: string; variant: 'destructive' | 'secondary' | 'outline' };
}) {
    const variantStyles = {
        default: 'text-foreground',
        danger: 'text-red-600 dark:text-red-400',
        success: 'text-emerald-600 dark:text-emerald-400',
        warning: 'text-amber-600 dark:text-amber-400',
    };

    const iconBgStyles = {
        default: 'bg-muted/50',
        danger: 'bg-red-500/10',
        success: 'bg-emerald-500/10',
        warning: 'bg-amber-500/10',
    };

    const iconColorStyles = {
        default: 'text-muted-foreground',
        danger: 'text-red-500',
        success: 'text-emerald-500',
        warning: 'text-amber-500',
    };

    return (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className={cn(
                'p-2 rounded-lg shrink-0',
                iconBgStyles[variant]
            )}>
                <Icon className={cn('h-4 w-4', iconColorStyles[variant])} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn('text-lg font-semibold tabular-nums truncate', variantStyles[variant])}>
                        {value}
                    </span>
                    {badge && (
                        <Badge variant={badge.variant} className="text-[10px] px-1.5 py-0">
                            {badge.label}
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    {trend && trendValue && (
                        <span className={cn(
                            'flex items-center text-[10px] font-medium',
                            trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
                        )}>
                            {trend === 'up' ? (
                                <ArrowUpRight className="h-3 w-3" />
                            ) : trend === 'down' ? (
                                <ArrowDownRight className="h-3 w-3" />
                            ) : null}
                            {trendValue}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

function FinancialHealthSkeleton() {
    return (
        <Card className="overflow-hidden">
            <CardHeader className="pb-2">
                <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent>
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Arc skeleton */}
                    <div className="flex justify-center lg:justify-start">
                        <Skeleton className="h-[140px] w-[140px] rounded-full" />
                    </div>
                    {/* Metrics skeleton */}
                    <div className="flex-1 grid gap-3">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                                <Skeleton className="h-8 w-8 rounded-lg" />
                                <div className="flex-1 space-y-1.5">
                                    <Skeleton className="h-5 w-24" />
                                    <Skeleton className="h-3 w-16" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function FinancialHealthCard({ financialHealth, isLoading }: FinancialHealthCardProps) {
    if (isLoading || !financialHealth) {
        return <FinancialHealthSkeleton />;
    }

    const {
        totalOutstanding,
        collectionRate,
        monthlyRevenue,
        previousMonthRevenue,
        revenueChange,
        overdueAmount,
        overdueCount,
        totalWalletBalance
    } = financialHealth;

    const revenueTrend = revenueChange > 0 ? 'up' : revenueChange < 0 ? 'down' : 'neutral';

    return (
        <Card className="overflow-hidden relative">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.02] via-transparent to-amber-500/[0.02] pointer-events-none" />

            <CardHeader className="pb-2 relative">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <CircleDollarSign className="h-5 w-5 text-emerald-500" />
                    Financial Health
                </CardTitle>
            </CardHeader>

            <CardContent className="relative">
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Collection Rate Arc - Hero Element */}
                    <div className="flex flex-col items-center gap-2 lg:pr-6 lg:border-r border-border/50">
                        <CollectionRateArc rate={collectionRate} />
                        <div className="text-center">
                            <p className="text-xs text-muted-foreground">
                                {formatCurrency(financialHealth.totalCollected)} collected
                            </p>
                        </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="flex-1 grid gap-2 sm:grid-cols-2">
                        <MetricItem
                            label="Outstanding Balance"
                            value={formatCurrency(totalOutstanding)}
                            icon={AlertTriangle}
                            variant={totalOutstanding > 0 ? 'danger' : 'success'}
                        />

                        <MetricItem
                            label="Monthly Revenue"
                            value={formatCurrency(monthlyRevenue)}
                            icon={TrendingUp}
                            variant={revenueChange >= 0 ? 'success' : 'warning'}
                            trend={revenueTrend}
                            trendValue={`${Math.abs(revenueChange).toFixed(1)}%`}
                        />

                        <MetricItem
                            label="Overdue Amount"
                            value={formatCurrency(overdueAmount)}
                            icon={TrendingDown}
                            variant={overdueAmount > 0 ? 'warning' : 'default'}
                            badge={overdueCount > 0 ? {
                                label: `${overdueCount} invoice${overdueCount > 1 ? 's' : ''}`,
                                variant: 'destructive'
                            } : undefined}
                        />

                        <MetricItem
                            label="Wallet Credits"
                            value={formatCurrency(totalWalletBalance)}
                            icon={Wallet}
                            variant={totalWalletBalance > 0 ? 'success' : 'default'}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
