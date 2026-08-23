'use client';

import { Suspense, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  useDashboardActionMetrics,
  useDashboardFinancialHealth,
  useDashboardInvoiceDistribution,
  useDashboardQuickStats,
  useDashboardRecentActivity,
} from '@/hooks/use-dashboard';
import { Skeleton } from '@/components/ui/skeleton';
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

function StatCardSkeleton() {
  return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>;
}

function StatsCards() {
  const { data: financialHealth, isLoading: fhLoading, isError: fhError } = useDashboardFinancialHealth();
  const { data: quickStats, isLoading: qsLoading, isError: qsError } = useDashboardQuickStats();
  const { data: actionMetrics, isError: actionMetricsError } = useDashboardActionMetrics();
  const { suggestions } = useSmartSuggestions();

  return (
    <ModernStatsCards
      financialHealth={financialHealth ?? null}
      quickStats={quickStats ?? null}
      actionMetrics={actionMetrics ?? null}
      suggestions={suggestions}
      isLoading={fhLoading || qsLoading}
      isUnavailable={fhError || qsError}
      areActionMetricsUnavailable={actionMetricsError}
    />
  );
}

function FinancialHealthCard() {
  const { data, isLoading } = useDashboardFinancialHealth();
  return <ModernFinancialHealth financialHealth={data ?? null} isLoading={isLoading} />;
}

function ActionsCard() {
  const { data, isLoading, isError } = useDashboardActionMetrics();
  return (
    <UnifiedActionsCard
      actionMetrics={data ?? null}
      isLoading={isLoading}
      isUnavailable={isError}
    />
  );
}

function PendingPaymentsCard() {
  const { data, isLoading } = useDashboardInvoiceDistribution();
  return <ModernPendingPayments distribution={data ?? null} isLoading={isLoading} />;
}

function RecentActivityCardStream() {
  const { data, isLoading } = useDashboardRecentActivity();
  return <ModernRecentActivity activities={data ?? null} isLoading={isLoading} />;
}

function DashboardContent() {
    const { profile, isLoading: authLoading } = useAuth();
    const navigationState = useDashboardNavigationState();

    if (authLoading) {
        return <DashboardSkeleton label="Loading dashboard authentication" state="auth" />;
    }

    return (
        <div className="space-y-6" data-dashboard-state="ready">
            <NavigationStateHandler unauthorized={navigationState.unauthorized} />

            <Suspense fallback={<StatCardSkeleton />}>
              <StatsCards />
            </Suspense>

            <div className="grid gap-6 lg:grid-cols-4">
                <div className="lg:col-span-2">
                    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
                      <FinancialHealthCard />
                    </Suspense>
                </div>
                <div className="lg:col-span-2">
                    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
                      <ActionsCard />
                    </Suspense>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
                  <PendingPaymentsCard />
                </Suspense>
                <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
                  <RecentActivityCardStream />
                </Suspense>
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
