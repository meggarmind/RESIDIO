'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, ChevronRight } from 'lucide-react';
import type { InvoiceStatusDistribution } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface InvoiceDistributionCardProps {
    distribution: InvoiceStatusDistribution | null;
    isLoading?: boolean;
}

interface StatusItem {
    key: keyof InvoiceStatusDistribution;
    label: string;
    color: string;
    bgColor: string;
}

const statusConfig: StatusItem[] = [
    { key: 'paid', label: 'Paid', color: '#10b981', bgColor: 'bg-emerald-500' },
    { key: 'partiallyPaid', label: 'Partial', color: '#3b82f6', bgColor: 'bg-blue-500' },
    { key: 'unpaid', label: 'Unpaid', color: '#f59e0b', bgColor: 'bg-amber-500' },
    { key: 'overdue', label: 'Overdue', color: '#ef4444', bgColor: 'bg-red-500' },
];

// SVG Donut Chart Component
function DonutChart({ distribution }: { distribution: InvoiceStatusDistribution }) {
    const total = Object.values(distribution).reduce((sum, val) => sum + val, 0);
    if (total === 0) {
        return (
            <div className="relative w-[120px] h-[120px] flex items-center justify-center">
                <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="16"
                        className="text-muted/20"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm text-muted-foreground">No data</span>
                </div>
            </div>
        );
    }

    const radius = 50;
    const strokeWidth = 16;
    const circumference = 2 * Math.PI * radius;

    let cumulativeOffset = 0;
    const segments = statusConfig.map((status) => {
        const value = distribution[status.key];
        const percentage = (value / total) * 100;
        const strokeDasharray = (percentage / 100) * circumference;
        const rotation = (cumulativeOffset / 100) * 360 - 90;
        cumulativeOffset += percentage;

        return {
            ...status,
            value,
            percentage,
            strokeDasharray,
            strokeDashoffset: 0,
            rotation,
        };
    }).filter(s => s.value > 0);

    return (
        <div className="relative w-[120px] h-[120px]">
            <svg width="120" height="120" viewBox="0 0 120 120">
                {/* Background circle */}
                <circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-muted/10"
                />
                {/* Segments */}
                {segments.map((segment, index) => (
                    <circle
                        key={segment.key}
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="none"
                        stroke={segment.color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={`${segment.strokeDasharray} ${circumference}`}
                        strokeLinecap="butt"
                        transform={`rotate(${segment.rotation} 60 60)`}
                        className="transition-all duration-500"
                        style={{
                            filter: `drop-shadow(0 0 3px ${segment.color}30)`,
                        }}
                    />
                ))}
            </svg>
            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums">{total}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Invoices
                </span>
            </div>
        </div>
    );
}

function LegendItem({ label, value, total, bgColor }: {
    label: string;
    value: number;
    total: number;
    bgColor: string;
}) {
    const percentage = total > 0 ? ((value / total) * 100).toFixed(0) : 0;

    return (
        <div className="flex items-center gap-2">
            <div className={cn('w-2.5 h-2.5 rounded-sm shrink-0', bgColor)} />
            <span className="text-xs text-muted-foreground flex-1">{label}</span>
            <span className="text-xs font-medium tabular-nums">{value}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                {percentage}%
            </span>
        </div>
    );
}

function InvoiceDistributionSkeleton() {
    return (
        <Card>
            <CardHeader className="pb-3">
                <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-6">
                    <Skeleton className="w-[120px] h-[120px] rounded-full" />
                    <div className="flex-1 space-y-3">
                        {[...Array(4)].map((_, i) => (
                            <Skeleton key={i} className="h-4 w-full" />
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function InvoiceDistributionCard({ distribution, isLoading }: InvoiceDistributionCardProps) {
    if (isLoading || !distribution) {
        return <InvoiceDistributionSkeleton />;
    }

    const total = Object.values(distribution).reduce((sum, val) => sum + val, 0) - distribution.void;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base font-semibold">
                    <div className="flex items-center gap-2">
                        <PieChart className="h-5 w-5 text-blue-500" />
                        Invoice Status
                    </div>
                    <Button variant="ghost" size="sm" asChild className="text-xs h-7 px-2">
                        <Link href="/billing/invoices">
                            Details
                            <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-6">
                    <DonutChart distribution={distribution} />
                    <div className="flex-1 space-y-2">
                        {statusConfig.map((status) => (
                            <LegendItem
                                key={status.key}
                                label={status.label}
                                value={distribution[status.key]}
                                total={total}
                                bgColor={status.bgColor}
                            />
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
