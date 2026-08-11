'use client';

import { ResidentsTable } from '@/components/residents/residents-table';
import { useResidentStats } from '@/hooks/use-residents';
import { Users, UserCheck, UserMinus, AlertCircle, Plus } from 'lucide-react';
import {
  EnhancedTableCard,
  EnhancedPageHeader,
} from '@/components/dashboard/enhanced-stat-card';
import { RegistryKpiStrip } from '@/components/dashboard/registry-kpi-strip';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function ResidentsPage() {
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
        actions={
          <Button asChild>
            <Link href="/residents/new"><Plus className="mr-2 h-4 w-4" />Add resident</Link>
          </Button>
        }
      />

      <RegistryKpiStrip
        isLoading={isLoading}
        items={[
          { label: 'Residents', value: stats?.total ?? 0, icon: Users },
          { label: 'Active', value: stats?.active ?? 0, detail: `${activePercentage}%`, icon: UserCheck, tone: 'success' },
          ...(stats?.inactive ? [{ label: 'Inactive', value: stats.inactive, icon: UserMinus, tone: 'warning' as const }] : []),
          ...(stats?.suspended ? [{ label: 'Suspended', value: stats.suspended, icon: AlertCircle, tone: 'danger' as const }] : []),
        ]}
      />

      {/* Resident Registry Table */}
      <EnhancedTableCard
        className="[&>div]:pt-4"
      >
        <ResidentsTable />
      </EnhancedTableCard>
    </div>
  );
}
