'use client';

import { HousesTable } from '@/components/houses/houses-table';
import { useHouseStats } from '@/hooks/use-houses';
import { Home, Building, DoorOpen, Plus, XCircle } from 'lucide-react';
import {
  EnhancedTableCard,
  EnhancedPageHeader,
} from '@/components/dashboard/enhanced-stat-card';
import { RegistryKpiStrip } from '@/components/dashboard/registry-kpi-strip';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function HousesPage() {
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
        actions={
          <Button asChild>
            <Link href="/houses/new"><Plus className="mr-2 h-4 w-4" />Add property</Link>
          </Button>
        }
      />

      <RegistryKpiStrip
        isLoading={isLoading}
        items={[
          { label: 'Properties', value: stats?.total ?? 0, icon: Home },
          { label: 'Occupied', value: stats?.occupied ?? 0, detail: `${occupancyRate}%`, icon: Building, tone: 'success' },
          { label: 'Vacant', value: stats?.vacant ?? 0, icon: DoorOpen, tone: stats?.vacant ? 'warning' : 'default' },
          ...(stats?.inactive ? [{ label: 'Inactive', value: stats.inactive, icon: XCircle, tone: 'danger' as const }] : []),
        ]}
      />

      {/* Property Registry Table */}
      <EnhancedTableCard
        className="[&>div]:pt-4"
      >
        <HousesTable />
      </EnhancedTableCard>
    </div>
  );
}
