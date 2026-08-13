'use client';

import dynamic from 'next/dynamic';
import { Users, UserCheck, UserPlus, Link as LinkIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EnhancedStatCard } from '@/components/dashboard/enhanced-stat-card';
import { useResidentAnalytics } from '@/hooks/use-analytics-residents';

const ResidentRoleChart = dynamic(
  () => import('@/components/analytics/resident-role-chart').then((m) => ({ default: m.ResidentRoleChart })),
  { loading: () => <Skeleton className="h-80 w-full" />, ssr: false }
);

const CategoryBreakdownChart = dynamic(
  () => import('@/components/analytics/category-breakdown-chart').then((m) => ({ default: m.CategoryBreakdownChart })),
  { loading: () => <Skeleton className="h-80 w-full" />, ssr: false }
);

export function ResidentsTab() {
  const { data, isLoading } = useResidentAnalytics();
  const totalResidents = (data?.byResidentType.primary ?? 0) + (data?.byResidentType.secondary ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <EnhancedStatCard
          title="Total Residents"
          value={totalResidents || '-'}
          icon={Users}
          isLoading={isLoading}
          accentColor="default"
        />
        <EnhancedStatCard
          title="Primary / Billable"
          value={data?.byResidentType.primary ?? '-'}
          icon={UserCheck}
          isLoading={isLoading}
          accentColor="info"
        />
        <EnhancedStatCard
          title="Secondary / Non-billable"
          value={data?.byResidentType.secondary ?? '-'}
          icon={UserPlus}
          isLoading={isLoading}
          accentColor="default"
        />
        <EnhancedStatCard
          title="Active Assignments"
          value={data?.totalActiveAssignments ?? '-'}
          icon={LinkIcon}
          isLoading={isLoading}
          accentColor="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ResidentRoleChart data={data?.byRole ?? null} isLoading={isLoading} />
        <CategoryBreakdownChart
          data={data?.byEntityType ?? null}
          isLoading={isLoading}
          title="Residents by Entity Type"
          description="Individual, corporate, developer"
          showAmount={false}
        />
      </div>
    </div>
  );
}
