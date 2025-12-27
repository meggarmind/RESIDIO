'use client';

import { Suspense } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

import { useDateRange } from '@/hooks/use-date-range';
import { useAnalytics } from '@/hooks/use-analytics';

import { AnalyticsHeader } from '@/components/analytics/analytics-header';
import { KPISummaryCards } from '@/components/analytics/kpi-summary-cards';
import { RevenueTrendChart } from '@/components/analytics/revenue-trend-chart';
import { CollectionRateChart } from '@/components/analytics/collection-rate-chart';
import { OccupancyGauge } from '@/components/analytics/occupancy-gauge';
import { PaymentComplianceCard } from '@/components/analytics/payment-compliance-card';
import { PaymentMethodBreakdown } from '@/components/analytics/payment-method-breakdown';
import { CategoryBreakdownChart } from '@/components/analytics/category-breakdown-chart';

/**
 * Analytics Page Client Component
 *
 * Renders the interactive analytics dashboard with all charts.
 * Uses React Query for data fetching with auto-refresh.
 */
export function AnalyticsPageClient() {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsDashboard />
    </Suspense>
  );
}

function AnalyticsDashboard() {
  const { dateRange } = useDateRange();
  const { data, isLoading, error } = useAnalytics({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <AnalyticsHeader />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading analytics</AlertTitle>
          <AlertDescription>
            {error.message || 'Failed to load analytics data. Please try again.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Filter */}
      <AnalyticsHeader />

      {/* KPI Summary Cards */}
      <KPISummaryCards kpis={data?.kpis ?? null} isLoading={isLoading} />

      {/* Main Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <RevenueTrendChart data={data?.revenueTrend ?? null} isLoading={isLoading} />
        <CollectionRateChart data={data?.collectionRateTrend ?? null} isLoading={isLoading} />
      </div>

      {/* Secondary Charts Row */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <OccupancyGauge data={data?.currentOccupancy ?? null} isLoading={isLoading} />
        <PaymentComplianceCard data={data?.paymentCompliance ?? null} isLoading={isLoading} />
        <PaymentMethodBreakdown data={data?.paymentMethods ?? null} isLoading={isLoading} />
      </div>

      {/* Category Breakdown (Full Width) */}
      <CategoryBreakdownChart data={data?.invoiceCategories ?? null} isLoading={isLoading} />

      {/* Last Updated Indicator */}
      {data?.lastUpdated && (
        <p className="text-xs text-muted-foreground text-center">
          Last updated: {new Date(data.lastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-1">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-24" />
          ))}
        </div>
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      {/* Charts Skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-[250px] rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-[280px] rounded-xl" />
    </div>
  );
}
