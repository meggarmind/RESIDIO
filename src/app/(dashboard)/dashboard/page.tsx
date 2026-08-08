'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { useEnhancedDashboardStats } from '@/hooks/use-dashboard';
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';

// Dashboard Components
import { UnifiedActionsCard } from '@/components/dashboard/unified-actions-card';
// ... (imports remain)
import { RecentActivityCard } from '@/components/dashboard/recent-activity-card';
import { useSmartSuggestions } from '@/hooks/use-smart-suggestions';
import { ModernStatsCards } from '@/components/dashboard/modern-stats-cards';
import { ModernFinancialHealth } from '@/components/dashboard/modern-financial-health';
import { ModernPendingPayments } from '@/components/dashboard/modern-pending-payments';
import { ModernRecentActivity } from '@/components/dashboard/modern-recent-activity';

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
// ... (omitting DashboardSkeleton for brevity as I'm replacing the whole block or using TargetContent)



export default function DashboardPage() {
    const { profile, isLoading: authLoading } = useAuth();
    const { data: stats, isLoading: statsLoading, error: statsError } = useEnhancedDashboardStats();
    const { suggestions } = useSmartSuggestions();

    if (authLoading) {
        return <DashboardSkeleton />;
    }

    const firstName = profile?.full_name?.trim() ? profile.full_name.trim().split(' ')[0] : 'there';
    const isLoading = statsLoading;

    if (statsError) {
        const errorMessage = statsError instanceof Error ? statsError.message : 'An unexpected error occurred';
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 max-w-md text-center">
                    <h3 className="font-semibold text-lg mb-2">Failed to load dashboard</h3>
                    <p className="text-sm opacity-90">{errorMessage}</p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                    className="gap-2"
                >
                    Retry loading
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Suspense fallback={null}>
                <ErrorHandler />
            </Suspense>

            {/* Top Stats Section */}
            <Suspense fallback={<div className="grid gap-4 md:grid-cols-4"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div>}>
            <ModernStatsCards
                financialHealth={stats?.financialHealth ?? null}
                quickStats={stats?.quickStats ?? null}
                unpaidCount={stats?.invoiceDistribution?.unpaid ?? 0}
                suggestions={suggestions}
                isLoading={isLoading}
            />
            </Suspense>

            {/* Main Content Grid: Financial Health + Unified Actions */}
            <div className="grid gap-6 lg:grid-cols-4">
                <div className="lg:col-span-2">
                    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
                    <ModernFinancialHealth
                        financialHealth={stats?.financialHealth ?? null}
                        isLoading={isLoading}
                    />
                    </Suspense>
                </div>

                <div className="lg:col-span-2">
                    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
                    <UnifiedActionsCard
                        securityAlerts={stats?.securityAlerts ?? null}
                        quickStats={stats?.quickStats ?? null}
                        unverifiedPaymentsCount={0}
                        isLoading={isLoading}
                    />
                    </Suspense>
                </div>
            </div>

            {/* Bottom Grid: Pending Payments & Recent Activity */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
                <ModernPendingPayments
                    distribution={stats?.invoiceDistribution ?? null}
                    isLoading={isLoading}
                />
                </Suspense>
                <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
                <ModernRecentActivity
                    activities={stats?.recentActivity ?? null}
                    isLoading={isLoading}
                />
                </Suspense>
            </div>

            {/* Last Updated */}
            {stats?.lastUpdated && (
                <p className="text-xs text-muted-foreground text-center">
                    Last updated: {new Date(stats.lastUpdated).toLocaleTimeString()}
                </p>
            )}

            {/* Debug Info (Only visible if ?debug=true) */}
            {typeof window !== 'undefined' && window.location.search.includes('debug=true') && (
                <div className="mt-8 p-4 bg-muted rounded-lg font-mono text-xs overflow-auto max-h-64">
                    <h4 className="font-bold mb-2">Debug Info:</h4>
                    <pre>{JSON.stringify({
                        profile: { id: profile?.id, role: profile?.role, name: profile?.full_name },
                        stats: {
                            loading: statsLoading,
                            error: statsError,
                            hasData: !!stats,
                            lastUpdated: stats?.lastUpdated
                        },
                        auth: { loading: authLoading }
                    }, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
