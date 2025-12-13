'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditFilters, AuditLogsTable } from '@/components/audit';
import { useAuditLogs, useAuditStats } from '@/hooks/use-audit-logs';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuditAction, AuditEntityType } from '@/types/database';

interface FilterState {
  entityType?: AuditEntityType;
  action?: AuditAction;
  actorId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>({});
  const limit = 25;

  const { data: logsData, isLoading } = useAuditLogs({
    ...filters,
    page,
    limit,
  });

  const { data: stats, isLoading: statsLoading } = useAuditStats();

  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setPage(1); // Reset to first page when filters change
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium">Audit Logs</h3>
        <p className="text-sm text-muted-foreground">
          View the complete audit trail of all significant actions in the system.
          Only admin and chairman roles can access this page.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today</CardDescription>
            <CardTitle className="text-2xl">
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                stats?.today ?? 0
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Events logged today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>This Week</CardDescription>
            <CardTitle className="text-2xl">
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                stats?.thisWeek ?? 0
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Events in the last 7 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>This Month</CardDescription>
            <CardTitle className="text-2xl">
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                stats?.thisMonth ?? 0
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Events this month</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Logs</CardTitle>
          <CardDescription>
            Use the filters below to narrow down the audit logs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditFilters onFiltersChange={handleFiltersChange} />
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>
            {logsData?.total ? `${logsData.total} total entries` : 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditLogsTable
            logs={logsData?.data ?? null}
            total={logsData?.total ?? 0}
            isLoading={isLoading}
            page={page}
            limit={limit}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
