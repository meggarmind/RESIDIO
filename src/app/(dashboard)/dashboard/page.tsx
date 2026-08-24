'use client';

import { Suspense, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useAdminDashboardSnapshot } from '@/hooks/use-dashboard';
import { toast } from 'sonner';
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton';
import { UnifiedActionsCard } from '@/components/dashboard/unified-actions-card';
import { useSmartSuggestions } from '@/hooks/use-smart-suggestions';
import { ModernStatsCards } from '@/components/dashboard/modern-stats-cards';
import { ModernFinancialHealth } from '@/components/dashboard/modern-financial-health';
import { ModernPendingPayments } from '@/components/dashboard/modern-pending-payments';
import { ModernRecentActivity } from '@/components/dashboard/modern-recent-activity';
import { useDashboardNavigationState } from '@/hooks/use-dashboard-navigation-state';

function NavigationStateHandler({ unauthorized }: { unauthorized: boolean }) {
    useEffect(() => {
        if (unauthorized) toast.error('You do not have permission to access that page');
    }, [unauthorized]);
    return null;
}

function DashboardContent() {
    const { profile, isLoading: authLoading } = useAuth();
    const navigationState = useDashboardNavigationState();
    const { data: snapshot, isLoading, isError } = useAdminDashboardSnapshot();
    const { suggestions } = useSmartSuggestions();

    if (authLoading) {
        return <DashboardSkeleton label="Loading dashboard authentication" state="auth" />;
    }

    return (
        <div className="space-y-6" data-dashboard-state="ready">
            <NavigationStateHandler unauthorized={navigationState.unauthorized} />

            <ModernStatsCards
              financialHealth={snapshot?.financialHealth ?? null}
              quickStats={snapshot?.quickStats ?? null}
              actionMetrics={snapshot?.actionMetrics ?? null}
              suggestions={suggestions}
              isLoading={isLoading}
              isUnavailable={isError}
              areActionMetricsUnavailable={isError}
            />

            <div className="grid gap-6 lg:grid-cols-4">
                <div className="lg:col-span-2">
                    <ModernFinancialHealth financialHealth={snapshot?.financialHealth ?? null} isLoading={isLoading} />
                </div>
                <div className="lg:col-span-2">
                    <UnifiedActionsCard
                      actionMetrics={snapshot?.actionMetrics ?? null}
                      isLoading={isLoading}
                      isUnavailable={isError}
                    />
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <ModernPendingPayments distribution={snapshot?.invoiceDistribution ?? null} isLoading={isLoading} />
                <ModernRecentActivity activities={snapshot?.recentActivity ?? null} isLoading={isLoading} />
            </div>

            {navigationState.debug && (
                <div className="mt-8 max-h-64 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs" data-dashboard-debug="true">
                    <h4 className="mb-2 font-bold">Debug Info:</h4>
                    <pre>{JSON.stringify({ profile: { id: profile?.id, role: profile?.role, name: profile?.full_name }, auth: { loading: authLoading } }, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<DashboardSkeleton label="Loading dashboard navigation" state="route" />}>
            <DashboardContent />
        </Suspense>
    );
}
