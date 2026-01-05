'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressRing } from '@/components/ui/progress-ring';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { ShimmerSkeleton } from '@/components/ui/shimmer-skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
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

// Enhanced Collection Rate Progress Ring
function CollectionRateRing({ rate, size = 140 }: { rate: number; size?: number }) {
    const clampedRate = Math.min(Math.max(rate, 0), 100);

    // Color and gradient based on rate
    const getColors = () => {
        if (clampedRate >= 80) {
            return {
                color: 'hsl(142.1 76.2% 36.3%)', // emerald-600
                gradientColor: 'hsl(142.1 70.6% 45.3%)', // emerald-500
            };
        }
        if (clampedRate >= 60) {
            return {
                color: 'hsl(24.6 95% 53.1%)', // orange-500
                gradientColor: 'hsl(37.7 92.1% 50.2%)', // amber-500
            };
        }
        return {
            color: 'hsl(0 84.2% 60.2%)', // red-500
            gradientColor: 'hsl(0 72.2% 50.6%)', // red-600
        };
    };

    const { color, gradientColor } = getColors();

    return (
        <ProgressRing
            value={clampedRate}
            size={size}
            strokeWidth={12}
            duration={1200}
            color={color}
            gradientColor={gradientColor}
            label="Collection"
        />
    );
}

function MetricItem({
    label,
    value,
    numericValue,
    icon: Icon,
    trend,
    trendValue,
    variant = 'default',
    badge
}: {
    label: string;
    value: string;
    numericValue?: number;
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
        <div className="group flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-all duration-200 hover:shadow-sm">
            <div className={cn(
                'p-2 rounded-lg shrink-0 transition-all duration-200 group-hover:scale-110',
                iconBgStyles[variant]
            )}>
                <Icon className={cn('h-4 w-4', iconColorStyles[variant])} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    {numericValue !== undefined ? (
                        <AnimatedCounter
                            value={numericValue}
                            prefix="₦"
                            formatNumber
                            className={cn('text-lg font-semibold', variantStyles[variant])}
                            duration={800}
                        />
                    ) : (
                        <span className={cn('text-lg font-semibold tabular-nums truncate', variantStyles[variant])}>
                            {value}
                        </span>
                    )}
                    {badge && (
                        <StatusBadge variant={badge.variant === 'destructive' ? 'error' : 'info'} size="sm">
                            {badge.label}
                        </StatusBadge>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    {trend && trendValue && (
                        <StatusBadge
                            variant={trend === 'up' ? 'up' : trend === 'down' ? 'down' : 'info'}
                            size="sm"
                            showIcon
                        >
                            {trendValue}
                        </StatusBadge>
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
                <ShimmerSkeleton width={144} height={20} speed="fast" />
            </CardHeader>
            <CardContent>
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Progress ring skeleton */}
                    <div className="flex flex-col items-center gap-2">
                        <ShimmerSkeleton width={140} height={140} rounded="full" speed="normal" />
                        <ShimmerSkeleton width={120} height={12} speed="fast" />
                    </div>
                    {/* Metrics skeleton */}
                    <div className="flex-1 grid gap-2 sm:grid-cols-2">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                                <ShimmerSkeleton width={32} height={32} rounded="lg" speed="fast" />
                                <div className="flex-1 space-y-1.5">
                                    <ShimmerSkeleton width={96} height={20} speed="fast" />
                                    <ShimmerSkeleton width={64} height={12} speed="fast" />
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
        <Card className="overflow-hidden relative animate-fade-in-up">
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
                    {/* Collection Rate Ring - Hero Element */}
                    <div className="flex flex-col items-center gap-2 lg:pr-6 lg:border-r border-border/50">
                        <CollectionRateRing rate={collectionRate} />
                        <div className="text-center">
                            <AnimatedCounter
                                value={financialHealth.totalCollected}
                                prefix="₦"
                                formatNumber
                                className="text-xs text-muted-foreground"
                                duration={1000}
                            />
                            <span className="text-xs text-muted-foreground"> collected</span>
                        </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="flex-1 grid gap-2 sm:grid-cols-2">
                        <MetricItem
                            label="Outstanding Balance"
                            value={formatCurrency(totalOutstanding)}
                            numericValue={totalOutstanding}
                            icon={AlertTriangle}
                            variant={totalOutstanding > 0 ? 'danger' : 'success'}
                        />

                        <MetricItem
                            label="Monthly Revenue"
                            value={formatCurrency(monthlyRevenue)}
                            numericValue={monthlyRevenue}
                            icon={TrendingUp}
                            variant={revenueChange >= 0 ? 'success' : 'warning'}
                            trend={revenueTrend}
                            trendValue={`${Math.abs(revenueChange).toFixed(1)}%`}
                        />

                        <MetricItem
                            label="Overdue Amount"
                            value={formatCurrency(overdueAmount)}
                            numericValue={overdueAmount}
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
                            numericValue={totalWalletBalance}
                            icon={Wallet}
                            variant={totalWalletBalance > 0 ? 'success' : 'default'}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
