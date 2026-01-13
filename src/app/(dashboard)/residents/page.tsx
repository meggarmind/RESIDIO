'use client';

import { ResidentsTable } from '@/components/residents/residents-table';
import { useResidentStats } from '@/hooks/use-residents';
import { Users, UserCheck, UserMinus, AlertCircle } from 'lucide-react';
import {
  EnhancedStatCard,
  EnhancedTableCard,
  EnhancedPageHeader,
} from '@/components/dashboard/enhanced-stat-card';
import { useVisualTheme } from '@/contexts/visual-theme-context';

export default function ResidentsPage() {
  const { themeId } = useVisualTheme();
  const isModern = themeId === 'modern';

  // Use optimized stats query instead of fetching all residents
  // This is ~1000x faster (4 COUNT queries vs fetching all rows)
  const { data: stats, isLoading } = useResidentStats();

  // Calculate active percentage
  const activePercentage = stats && stats.total > 0
    ? Math.round((stats.active / stats.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <EnhancedPageHeader
        title="Residents"
        description="Manage community members and their access"
        icon={Users}
      />

      {/* Stats Cards Section */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <EnhancedStatCard
          title="Total Residents"
          value={stats?.total ?? 0}
          icon={Users}
          isLoading={isLoading}
          description="Registered members"
          accentColor="info"
          className="stagger-1"
        />
        <EnhancedStatCard
          title="Active"
          value={stats?.active ?? 0}
          icon={UserCheck}
          isLoading={isLoading}
          description={`${activePercentage}% of total`}
          accentColor="success"
          className="stagger-2"
        />
        <EnhancedStatCard
          title="Inactive"
          value={stats?.inactive ?? 0}
          icon={UserMinus}
          isLoading={isLoading}
          description="Deactivated accounts"
          accentColor={stats?.inactive && stats.inactive > 0 ? 'warning' : 'default'}
          className="stagger-3"
        />
        <EnhancedStatCard
          title="Suspended"
          value={stats?.suspended ?? 0}
          icon={AlertCircle}
          isLoading={isLoading}
          description="Requires attention"
          accentColor={stats?.suspended && stats.suspended > 0 ? 'danger' : 'default'}
          className="stagger-4"
        />
      </div>

      {/* Resident Registry Table */}
      <EnhancedTableCard
        title="Resident Registry"
        description="View and manage all residents in the community"
      >
        <ResidentsTable />
      </EnhancedTableCard>
    </div>
  );
}
