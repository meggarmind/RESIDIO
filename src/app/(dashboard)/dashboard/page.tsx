'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { useEnhancedDashboardStats } from '@/hooks/use-dashboard';
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

// Default Theme Dashboard Components
import { FinancialHealthCard } from '@/components/dashboard/financial-health-card';
import { SecurityAlertsCard } from '@/components/dashboard/security-alerts-card';
import { QuickActionsPanel } from '@/components/dashboard/quick-actions-panel';
import { QuickStatsCard } from '@/components/dashboard/quick-stats-card';
import { InvoiceDistributionCard } from '@/components/dashboard/invoice-distribution-card';
import { RecentActivityCard } from '@/components/dashboard/recent-activity-card';
import { CronHealthCard } from '@/components/dashboard/cron-health-card';

import { ContextualGreeting } from '@/components/dashboard/contextual-greeting';
import { SmartSuggestions } from '@/components/dashboard/smart-suggestions';
import { ModernStatsCards } from '@/components/dashboard/modern-stats-cards';
import { ModernFinancialHealth } from '@/components/dashboard/modern-financial-health';
import { ModernPendingPayments } from '@/components/dashboard/modern-pending-payments';
import { ModernRecentActivity } from '@/components/dashboard/modern-recent-activity';
import { ModernQuickActions } from '@/components/dashboard/modern-quick-actions';

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
            <div className="animate-slide-up">
                <Skeleton className="h-9 w-64 rounded-lg" />
                <Skeleton className="h-5 w-80 mt-2 rounded-md" />
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className={`rounded-2xl border bg-card p-6 shadow-soft animate-slide-up stagger-${i}`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <Skeleton className="h-4 w-24 rounded-md" />
                            <Skeleton className="h-11 w-11 rounded-xl" />
                        </div>
                        <Skeleton className="h-9 w-20 rounded-lg mb-2" />
                        <Skeleton className="h-3 w-32 rounded-md" />
                    </div>
                ))}
            </div>

            {/* Main Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border bg-card p-6 shadow-soft animate-slide-up stagger-5">
                    <Skeleton className="h-6 w-40 rounded-lg mb-4" />
                    <Skeleton className="h-[200px] w-full rounded-xl" />
                </div>
                <div className="rounded-2xl border bg-card p-6 shadow-soft animate-slide-up stagger-6">
                    <Skeleton className="h-6 w-40 rounded-lg mb-4" />
                    <Skeleton className="h-[200px] w-full rounded-xl" />
                </div>
            </div>

            {/* Quick Actions */}
            <div className="rounded-2xl border bg-card p-6 shadow-soft animate-slide-up">
                <Skeleton className="h-6 w-32 rounded-lg mb-4" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                </div>
            </div>

            {/* Bottom Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border bg-card p-6 shadow-soft animate-slide-up">
                    <Skeleton className="h-6 w-40 rounded-lg mb-4" />
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-16 w-full rounded-xl" />
                        ))}
                    </div>
                </div>
                <div className="rounded-2xl border bg-card p-6 shadow-soft animate-slide-up">
                    <Skeleton className="h-6 w-40 rounded-lg mb-4" />
                    <div className="space-y-3">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-12 w-full rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const { profile, isLoading: authLoading } = useAuth();
    const { data: stats, isLoading: statsLoading } = useEnhancedDashboardStats();
    const { themeId } = useVisualTheme();

    if (authLoading) {
        return <DashboardSkeleton />;
    }

    const firstName = profile?.full_name?.split(' ')[0] || 'there';
    const isLoading = statsLoading;
    const isModernTheme = themeId === 'modern';

    return (
        <div className="space-y-6">
            <Suspense fallback={null}>
                <ErrorHandler />
            </Suspense>

            {/* Welcome Header - Conditional rendering based on theme */}
            {isModernTheme ? (
                <ContextualGreeting name={firstName} />
            ) : (
                <WelcomeHeader name={firstName} />
            )}

            {/* Stats Row - Conditional rendering based on theme */}
            {isModernTheme ? (
                <>
                    <ModernStatsCards
                        financialHealth={stats?.financialHealth ?? null}
                        quickStats={stats?.quickStats ?? null}
                        unpaidCount={stats?.invoiceDistribution?.unpaid ?? 0}
                        isLoading={isLoading}
                    />
                    {!isLoading && <SmartSuggestions />}
                </>
            ) : (
                <QuickStatsCard
                    quickStats={stats?.quickStats ?? null}
                    isLoading={isLoading}
                />
            )}

            {/* Financial Health & Secondary Card - Conditional rendering based on theme */}
            {isModernTheme ? (
                <div className="grid gap-6 lg:grid-cols-2">
                    <ModernFinancialHealth
                        financialHealth={stats?.financialHealth ?? null}
                        isLoading={isLoading}
                    />
                    <ModernPendingPayments
                        distribution={stats?.invoiceDistribution ?? null}
                        isLoading={isLoading}
                    />
                </div>
            ) : (
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
            )}

            {/* Quick Actions - Conditional rendering based on theme */}
            {isModernTheme ? (
                <ModernQuickActions />
            ) : (
                <QuickActionsPanel />
            )}

            {/* System Health (Admin only) */}
            {profile?.role_name === 'super_admin' && (
                <CronHealthCard />
            )}

            {/* Invoice Distribution & Recent Activity - Conditional rendering based on theme */}
            {isModernTheme ? (
                <ModernRecentActivity
                    activities={stats?.recentActivity ?? null}
                    isLoading={isLoading}
                />
            ) : (
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
            )}

            {/* Last Updated */}
            {stats?.lastUpdated && (
                <p className="text-xs text-muted-foreground text-center">
                    Last updated: {new Date(stats.lastUpdated).toLocaleTimeString()}
                </p>
            )}
        </div>
    );
}
