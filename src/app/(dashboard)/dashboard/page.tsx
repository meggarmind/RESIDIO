'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  useDashboardFinancialHealth,
  useDashboardInvoiceDistribution,
  useDashboardSecurityAlerts,
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

function ErrorHandler() {
    const searchParams = useSearchParams();
    useEffect(() => {
        const error = searchParams.get('error');
        if (error === 'unauthorized') toast.error('You do not have permission to access that page');
    }, [searchParams]);
    return null;
}

function StatCardSkeleton() {
  return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>;
}

function StatsCards() {
  const { data: financialHealth, isLoading: fhLoading } = useDashboardFinancialHealth();
  const { data: quickStats, isLoading: qsLoading } = useDashboardQuickStats();
  const { data: invoiceDist } = useDashboardInvoiceDistribution();
  const { suggestions } = useSmartSuggestions();

  return (
    <ModernStatsCards
      financialHealth={financialHealth ?? null}
      quickStats={quickStats ?? null}
      unpaidCount={invoiceDist?.unpaid ?? 0}
      suggestions={suggestions}
      isLoading={fhLoading || qsLoading}
    />
  );
}

function FinancialHealthCard() {
  const { data, isLoading } = useDashboardFinancialHealth();
  return <ModernFinancialHealth financialHealth={data ?? null} isLoading={isLoading} />;
}

function ActionsCard() {
  const { data: securityAlerts } = useDashboardSecurityAlerts();
  const { data: quickStats } = useDashboardQuickStats();
  return <UnifiedActionsCard securityAlerts={securityAlerts ?? null} quickStats={quickStats ?? null} unverifiedPaymentsCount={0} isLoading={false} />;
}

function PendingPaymentsCard() {
  const { data, isLoading } = useDashboardInvoiceDistribution();
  return <ModernPendingPayments distribution={data ?? null} isLoading={isLoading} />;
}

function RecentActivityCardStream() {
  const { data, isLoading } = useDashboardRecentActivity();
  return <ModernRecentActivity activities={data ?? null} isLoading={isLoading} />;
}

export default function DashboardPage() {
    const { profile, isLoading: authLoading } = useAuth();

    if (authLoading) return <DashboardSkeleton />;

    return (
        <div className="space-y-6">
            <Suspense fallback={null}><ErrorHandler /></Suspense>

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

            {typeof window !== 'undefined' && window.location.search.includes('debug=true') && (
                <div className="mt-8 p-4 bg-muted rounded-lg font-mono text-xs overflow-auto max-h-64">
                    <h4 className="font-bold mb-2">Debug Info:</h4>
                    <pre>{JSON.stringify({ profile: { id: profile?.id, role: profile?.role, name: profile?.full_name }, auth: { loading: authLoading } }, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
