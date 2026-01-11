'use client';

import { HousesTable } from '@/components/houses/houses-table';
import { useHouseStats } from '@/hooks/use-houses';
import { Home, Building, DoorOpen, XCircle } from 'lucide-react';
import {
  EnhancedStatCard,
  EnhancedTableCard,
  EnhancedPageHeader,
} from '@/components/dashboard/enhanced-stat-card';
import { useVisualTheme } from '@/contexts/visual-theme-context';
import { cn } from '@/lib/utils';

export default function HousesPage() {
  const { themeId } = useVisualTheme();
  const isModern = themeId === 'modern';

  // Use optimized stats query
  const { data: stats, isLoading } = useHouseStats();

  // Calculate occupancy rate
  const occupancyRate = stats && stats.total > 0
    ? Math.round((stats.occupied / stats.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <EnhancedPageHeader
        title="Houses"
        description="Manage properties in the estate"
        icon={Home}
      />

      {/* Stats Cards Section */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <EnhancedStatCard
          title="Total Properties"
          value={stats?.total ?? 0}
          icon={Home}
          isLoading={isLoading}
          description="Registered houses"
          accentColor="info"
          className="stagger-1"
        />
        <EnhancedStatCard
          title="Occupied"
          value={stats?.occupied ?? 0}
          icon={Building}
          isLoading={isLoading}
          description={`${occupancyRate}% occupancy rate`}
          accentColor="success"
          className="stagger-2"
        />
        <EnhancedStatCard
          title="Vacant"
          value={stats?.vacant ?? 0}
          icon={DoorOpen}
          isLoading={isLoading}
          description="Available properties"
          accentColor={stats?.vacant && stats.vacant > 0 ? 'warning' : 'default'}
          className="stagger-3"
        />
        <EnhancedStatCard
          title="Inactive"
          value={stats?.inactive ?? 0}
          icon={XCircle}
          isLoading={isLoading}
          description="Deactivated properties"
          accentColor={stats?.inactive && stats.inactive > 0 ? 'danger' : 'default'}
          className="stagger-4"
        />
      </div>

      {/* Property Registry Table */}
      <EnhancedTableCard
        title="Property Registry"
        description="View and manage all houses and properties in the community"
      >
        <HousesTable />
      </EnhancedTableCard>
    </div>
  );
}
