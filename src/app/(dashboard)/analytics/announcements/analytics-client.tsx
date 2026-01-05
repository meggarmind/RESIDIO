'use client';

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertCircle, Megaphone, Users, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { useDateRange } from '@/hooks/use-date-range';
import { useAnnouncementAnalytics } from '@/hooks/use-announcement-analytics';
import { DateRangeFilter } from '@/components/analytics/date-range-filter';
import type { AnalyticsPreset, AnalyticsDateRange } from '@/types/analytics';

import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

// Lazy load chart components for performance
const PublishedTrendChart = dynamic(
  () =>
    import('@/components/analytics/announcements/published-trend-chart').then((mod) => ({
      default: mod.PublishedTrendChart,
    })),
  { loading: () => <Skeleton className="h-[300px] w-full" />, ssr: false }
);

const CategoryEngagementChart = dynamic(
  () =>
    import('@/components/analytics/announcements/category-engagement-chart').then((mod) => ({
      default: mod.CategoryEngagementChart,
    })),
  { loading: () => <Skeleton className="h-[300px] w-full" />, ssr: false }
);

const PriorityDistributionChart = dynamic(
  () =>
    import('@/components/analytics/announcements/priority-distribution-chart').then((mod) => ({
      default: mod.PriorityDistributionChart,
    })),
  { loading: () => <Skeleton className="h-[250px] w-full" />, ssr: false }
);

const TopAnnouncementsTable = dynamic(
  () =>
    import('@/components/analytics/announcements/top-announcements-table').then((mod) => ({
      default: mod.TopAnnouncementsTable,
    })),
  { loading: () => <Skeleton className="h-[300px] w-full" />, ssr: false }
);

/**
 * Announcement Analytics Page Client Component
 *
 * Renders the interactive announcement analytics dashboard with metrics and charts.
 */
export function AnnouncementAnalyticsClient() {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnnouncementAnalyticsDashboard />
    </Suspense>
  );
}

function AnnouncementAnalyticsDashboard() {
  const { dateRange, preset, setPreset, setCustomRange } = useDateRange();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error } = useAnnouncementAnalytics({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    granularity: 'month',
    topLimit: 10,
  });

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['announcementAnalytics'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <AnnouncementAnalyticsHeader
          preset={preset}
          dateRange={dateRange}
          onPresetChange={setPreset}
          onCustomRangeChange={setCustomRange}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading analytics</AlertTitle>
          <AlertDescription>
            {error.message || 'Failed to load announcement analytics. Please try again.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const metrics = data?.metrics;

  return (
    <div className="space-y-6">
      {/* Header with Date Filter */}
      <AnnouncementAnalyticsHeader
        preset={preset}
        dateRange={dateRange}
        onPresetChange={setPreset}
        onCustomRangeChange={setCustomRange}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Published"
          value={metrics?.totalPublished ?? 0}
          icon={Megaphone}
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
          isLoading={isLoading}
        />
        <MetricCard
          title="Total Reached"
          value={metrics?.totalReached ?? 0}
          icon={Users}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-100"
          isLoading={isLoading}
        />
        <MetricCard
          title="Avg Engagement"
          value={`${metrics?.avgEngagementRate?.toFixed(1) ?? '0.0'}%`}
          icon={TrendingUp}
          iconColor="text-purple-600"
          iconBg="bg-purple-100"
          isLoading={isLoading}
        />
        <MetricCard
          title="Emergency Alerts"
          value={metrics?.emergencyBroadcasts ?? 0}
          icon={AlertTriangle}
          iconColor="text-red-600"
          iconBg="bg-red-100"
          isLoading={isLoading}
        />
      </div>

      {/* Main Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <PublishedTrendChart data={data?.publishedTrend ?? null} isLoading={isLoading} />
        <CategoryEngagementChart data={data?.categoryEngagement ?? null} isLoading={isLoading} />
      </div>

      {/* Secondary Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <PriorityDistributionChart
          data={data?.priorityDistribution ?? null}
          isLoading={isLoading}
        />
        <TopAnnouncementsTable data={data?.topAnnouncements ?? null} isLoading={isLoading} />
      </div>

      {/* Last Updated Indicator */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground text-center">
          Last updated: {new Date().toLocaleString()}
        </p>
      )}
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  isLoading?: boolean;
}

function MetricCard({ title, value, icon: Icon, iconColor, iconBg, isLoading }: MetricCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className={cn('p-2 rounded-lg', iconBg)}>
            <Icon className={cn('h-4 w-4', iconColor)} />
          </div>
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

interface AnnouncementAnalyticsHeaderProps {
  preset: AnalyticsPreset;
  dateRange: AnalyticsDateRange;
  onPresetChange: (preset: AnalyticsPreset) => void;
  onCustomRangeChange: (startDate: string, endDate: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

function AnnouncementAnalyticsHeader({
  preset,
  dateRange,
  onPresetChange,
  onCustomRangeChange,
  onRefresh,
  isRefreshing,
}: AnnouncementAnalyticsHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Title Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Announcement Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Engagement metrics and communication insights
            </p>
          </div>
        </div>

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Date Range Filter */}
      <DateRangeFilter
        preset={preset}
        dateRange={dateRange}
        onPresetChange={onPresetChange}
        onCustomRangeChange={onCustomRangeChange}
      />
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
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
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

      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-[250px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    </div>
  );
}
