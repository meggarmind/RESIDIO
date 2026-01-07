'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { useEnhancedDashboardStats } from '@/hooks/use-dashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

// Dashboard Components
import { FinancialHealthCard } from '@/components/dashboard/financial-health-card';
import { SecurityAlertsCard } from '@/components/dashboard/security-alerts-card';
import { QuickActionsPanel } from '@/components/dashboard/quick-actions-panel';
import { QuickStatsCard } from '@/components/dashboard/quick-stats-card';
import { InvoiceDistributionCard } from '@/components/dashboard/invoice-distribution-card';
import { RecentActivityCard } from '@/components/dashboard/recent-activity-card';
import { CronHealthCard } from '@/components/dashboard/cron-health-card';

function ErrorHandler() {
    const searchParams = useSearchParams();

    useEffect(() => {
        const error = searchParams.get('error');
        if (error === 'unauthorized') {
            toast.error('You do not have permission to access that page');
        }
    }, [searchParams]);

    return null;
}

function WelcomeHeader({ name }: { name: string }) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {greeting}, {name}
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
                Here&apos;s what&apos;s happening in your community today.
            </p>
        </div>
    );
}

function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-5 w-80 mt-2" />
            </div>

            {/* Quick Stats */}
            <Skeleton className="h-24 w-full rounded-lg" />

            {/* Main Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Skeleton className="h-[280px] rounded-lg" />
                <Skeleton className="h-[280px] rounded-lg" />
            </div>

            {/* Quick Actions */}
            <Skeleton className="h-[200px] rounded-lg" />

            {/* Bottom Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Skeleton className="h-[280px] rounded-lg" />
                <Skeleton className="h-[320px] rounded-lg" />
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const { profile, isLoading: authLoading } = useAuth();
    const { data: stats, isLoading: statsLoading } = useEnhancedDashboardStats();

    if (authLoading) {
        return <DashboardSkeleton />;
    }

    const firstName = profile?.full_name?.split(' ')[0] || 'there';
    const isLoading = statsLoading;

    return (
        <div className="space-y-6">
            <Suspense fallback={null}>
                <ErrorHandler />
            </Suspense>

            {/* Welcome Header */}
            <WelcomeHeader name={firstName} />

            {/* Quick Stats Row */}
            <QuickStatsCard
                quickStats={stats?.quickStats ?? null}
                isLoading={isLoading}
            />

            {/* Financial Health & Security Alerts */}
            <div className="grid gap-6 lg:grid-cols-2">
                <FinancialHealthCard
                    financialHealth={stats?.financialHealth ?? null}
                    isLoading={isLoading}
                />
                <SecurityAlertsCard
                    securityAlerts={stats?.securityAlerts ?? null}
                    isLoading={isLoading}
                />
            </div>

            {/* Quick Actions */}
            <QuickActionsPanel />

            {/* System Health (Admin only) */}
            {profile?.role_name === 'super_admin' && (
                <CronHealthCard />
            )}

            {/* Invoice Distribution & Recent Activity */}
            <div className="grid gap-6 lg:grid-cols-2">
                <InvoiceDistributionCard
                    distribution={stats?.invoiceDistribution ?? null}
                    isLoading={isLoading}
                />
                <RecentActivityCard
                    activities={stats?.recentActivity ?? null}
                    isLoading={isLoading}
                />
            </div>

            {/* Last Updated */}
            {stats?.lastUpdated && (
                <p className="text-xs text-muted-foreground text-center">
                    Last updated: {new Date(stats.lastUpdated).toLocaleTimeString()}
                </p>
            )}
        </div>
    );
}
