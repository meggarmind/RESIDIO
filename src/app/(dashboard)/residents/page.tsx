'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ResidentsTable } from '@/components/residents/residents-table';
import { useResidents } from '@/hooks/use-residents';
import { Users, UserCheck, UserMinus, AlertCircle } from 'lucide-react';
import type { AccountStatus } from '@/types/database';

function StatCard({
  title,
  value,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  isLoading: boolean;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <p className="text-3xl font-bold">{value}</p>
            )}
          </div>
          <Icon className="size-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function ResidentsPage() {
  // Fetch all residents to calculate stats (no filters)
  const { data, isLoading } = useResidents({ limit: 10000 });

  // Calculate stats from residents data
  const stats = {
    total: data?.data?.length || 0,
    active: data?.data?.filter((r) => r.account_status === 'active').length || 0,
    inactive: data?.data?.filter((r) => r.account_status === 'inactive').length || 0,
    suspended: data?.data?.filter((r) => r.account_status === 'suspended').length || 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Residents</h1>
        <p className="text-muted-foreground">Manage community members and their access.</p>
      </div>

      {/* Stats Cards Section */}
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Residents"
            value={stats.total}
            icon={Users}
            isLoading={isLoading}
          />
          <StatCard
            title="Active"
            value={stats.active}
            icon={UserCheck}
            isLoading={isLoading}
          />
          <StatCard
            title="Inactive"
            value={stats.inactive}
            icon={UserMinus}
            isLoading={isLoading}
          />
          <StatCard
            title="Suspended"
            value={stats.suspended}
            icon={AlertCircle}
            isLoading={isLoading}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Resident Registry
          </CardTitle>
          <CardDescription>
            View and manage all residents in the community.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResidentsTable />
        </CardContent>
      </Card>
    </div>
  );
}
