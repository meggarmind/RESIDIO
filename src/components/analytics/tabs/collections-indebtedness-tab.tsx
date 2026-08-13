'use client';

import dynamic from 'next/dynamic';
import { AlertCircle, TrendingUp, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EnhancedStatCard } from '@/components/dashboard/enhanced-stat-card';
import { useDashboardFinancialHealth } from '@/hooks/use-dashboard';
import { useCollectionsTrend, useIndebtednessAnalytics } from '@/hooks/use-analytics-collections';
import { formatCurrency } from '@/lib/utils';

const CollectionsTrendChart = dynamic(
  () => import('@/components/analytics/collections-trend-chart').then((m) => ({ default: m.CollectionsTrendChart })),
  { loading: () => <Skeleton className="h-80 w-full" />, ssr: false }
);

const IndebtednessRankingTable = dynamic(
  () => import('@/components/analytics/indebtedness-ranking-table').then((m) => ({ default: m.IndebtednessRankingTable })),
  { loading: () => <Skeleton className="h-80 w-full" />, ssr: false }
);

const CategoryBreakdownChart = dynamic(
  () => import('@/components/analytics/category-breakdown-chart').then((m) => ({ default: m.CategoryBreakdownChart })),
  { loading: () => <Skeleton className="h-80 w-full" />, ssr: false }
);

export function CollectionsIndebtednessTab() {
  const { data: financialHealth, isLoading: fhLoading } = useDashboardFinancialHealth();
  const { data: trend, isLoading: trendLoading } = useCollectionsTrend(6);
  const { data: indebtedness, isLoading: indebtednessLoading } = useIndebtednessAnalytics();

  const byStreetChartData = (indebtedness?.byStreet ?? []).slice(0, 8).map((s) => ({
    category: s.streetName,
    count: 0,
    amount: s.totalOutstanding,
    percentage: 0,
  }));
  const byHouseTypeChartData = (indebtedness?.byHouseType ?? []).map((t) => ({
    category: t.houseTypeName,
    count: 0,
    amount: t.totalOutstanding,
    percentage: 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <EnhancedStatCard
          title="Total Outstanding"
          value={formatCurrency(financialHealth?.totalOutstanding ?? 0)}
          icon={AlertCircle}
          isLoading={fhLoading}
          accentColor="warning"
        />
        <EnhancedStatCard
          title="Collection Rate"
          value={`${(financialHealth?.collectionRate ?? 0).toFixed(1)}%`}
          icon={TrendingUp}
          isLoading={fhLoading}
          accentColor="success"
        />
        <EnhancedStatCard
          title="Overdue Amount"
          value={formatCurrency(financialHealth?.overdueAmount ?? 0)}
          icon={Clock}
          isLoading={fhLoading}
          accentColor="danger"
        />
      </div>

      <CollectionsTrendChart data={trend ?? null} isLoading={trendLoading} />

      <div className="grid gap-6 lg:grid-cols-2">
        <IndebtednessRankingTable
          title="Top 10 Indebted"
          description="Highest outstanding balance"
          data={indebtedness?.topIndebted ?? null}
          isLoading={indebtednessLoading}
          variant="top"
        />
        <IndebtednessRankingTable
          title="Top 10 Non-Indebted"
          description="Lowest outstanding balance / biggest surplus"
          data={indebtedness?.topNonIndebted ?? null}
          isLoading={indebtednessLoading}
          variant="bottom"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryBreakdownChart
          data={byStreetChartData}
          isLoading={indebtednessLoading}
          title="Outstanding by Street"
          description="Total outstanding balance per street"
        />
        <CategoryBreakdownChart
          data={byHouseTypeChartData}
          isLoading={indebtednessLoading}
          title="Outstanding by House Type"
          description="Total outstanding balance per house type"
        />
      </div>
    </div>
  );
}
