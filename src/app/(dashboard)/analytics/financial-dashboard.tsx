'use client';

import { Suspense, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EnhancedPageHeader } from '@/components/dashboard/enhanced-stat-card';
import {
  useDashboardFinancialHealth,
  useDashboardInvoiceDistribution,
  useDashboardQuickStats,
} from '@/hooks/use-dashboard';
import { useAnalytics } from '@/hooks/use-analytics';
import { formatCurrency } from '@/lib/utils';
import {
  BarChart3,
  TrendingUp,
  AlertCircle,
  DollarSign,
  Clock,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Users,
} from 'lucide-react';
import dynamic from 'next/dynamic';

const RevenueTrendChart = dynamic(
  () => import('@/components/analytics/revenue-trend-chart').then((m) => ({ default: m.RevenueTrendChart })),
  { loading: () => <Skeleton className="h-80 w-full" />, ssr: false }
);

const FinancialDashboardSkeleton = () => (
  <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
    </div>
    <Skeleton className="h-80 rounded-xl" />
    <div className="grid gap-6 lg:grid-cols-2">
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  </div>
);

export function FinancialDashboard() {
  return (
    <Suspense fallback={<FinancialDashboardSkeleton />}>
      <FinancialDashboardContent />
    </Suspense>
  );
}

function FinancialDashboardContent() {
  const { data: financialHealth, isLoading: fhLoading } = useDashboardFinancialHealth();
  const { data: invoiceDist } = useDashboardInvoiceDistribution();
  const { data: quickStats } = useDashboardQuickStats();

  // Trailing 12-month range for the Revenue vs Expenses trend chart
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 11);
    start.setDate(1);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }, []);
  const { data: trendData, isLoading: trendLoading } = useAnalytics({ startDate, endDate });

  return (
    <div className="space-y-6">
      <EnhancedPageHeader
        title="Financial Dashboard"
        description="Revenue, collections, aging, and portfolio overview"
        icon={BarChart3}
      />

      {/* Collection Health Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Collection Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fhLoading ? <Skeleton className="h-8 w-16" /> : `${(financialHealth?.collectionRate ?? 0).toFixed(1)}%`}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{fhLoading ? <Skeleton className="h-8 w-24" /> : formatCurrency(financialHealth?.totalOutstanding ?? 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue Invoices</CardTitle>
            <Clock className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{fhLoading ? <Skeleton className="h-8 w-12" /> : invoiceDist?.overdue ?? 0}</div>
            <div className="text-xs text-muted-foreground">{fhLoading ? <Skeleton className="h-3 w-24 mt-1" /> : `${formatCurrency(financialHealth?.overdueAmount ?? 0)} total`}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Portfolio Value</CardTitle>
            <Wallet className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{fhLoading ? <Skeleton className="h-8 w-28" /> : formatCurrency(financialHealth?.portfolioValue ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue vs Expenses Monthly Trend */}
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <RevenueTrendChart data={trendData?.revenueTrend ?? null} isLoading={trendLoading} />
      </Suspense>

      {/* Bottom Row: Invoice Distribution + Quick Stats */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Invoice Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {['paid', 'unpaid', 'partially_paid', 'overdue', 'void'].map((status) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm capitalize text-muted-foreground">{status.replace('_', ' ')}</span>
                  <div className="flex items-center gap-3">
                    <div className="h-2 rounded-full bg-muted w-32 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${(invoiceDist && (invoiceDist as Record<string, number>)[status] > 0)
                            ? ((invoiceDist as Record<string, number>)[status] / ((invoiceDist?.paid ?? 0) + (invoiceDist?.unpaid ?? 0) + (invoiceDist?.partiallyPaid ?? 0) + (invoiceDist?.overdue ?? 0) + (invoiceDist?.void ?? 0) || 1)) * 100
                            : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium tabular-nums w-8 text-right">{(invoiceDist as Record<string, number>)?.[status] ?? '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Quick Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total Houses', value: quickStats?.totalHouses, icon: DollarSign },
                { label: 'Occupied', value: quickStats?.occupiedHouses, icon: ArrowUpRight, color: 'text-emerald-600' },
                { label: 'Vacant', value: quickStats?.vacantHouses, icon: ArrowDownRight, color: 'text-amber-600' },
                { label: 'Residents', value: quickStats?.activeResidents, icon: Users, color: 'text-blue-600' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className={`mt-1 text-xl font-bold tabular-nums ${stat.color || ''}`}>{stat.value ?? '-'}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
