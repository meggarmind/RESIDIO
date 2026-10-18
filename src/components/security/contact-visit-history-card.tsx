'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History, Loader2 } from 'lucide-react';
import {
  useVisitorHistorySummary,
  useContactVisitHistory,
  useCurrentUserSecurityPermissions,
} from '@/hooks/use-security';

const PAGE_SIZE = 10;

export function formatDuration(minutes: number | null | undefined) {
  if (minutes == null) return '—';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded}m`;
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
}

/**
 * Read-only visit history for one contact (#121, AD-04).
 * Gated on security.view_logs, the permission both reads enforce.
 */
export function ContactVisitHistoryCard({ contactId }: { contactId: string }) {
  const { data: permissionsData } = useCurrentUserSecurityPermissions();
  const canViewLogs = permissionsData?.permissions?.view_access_logs || false;
  const [page, setPage] = useState(1);

  const enabledId = canViewLogs ? contactId : undefined;
  const { data: summary } = useVisitorHistorySummary(enabledId);
  const { data: history, isLoading } = useContactVisitHistory(enabledId, page, PAGE_SIZE);

  if (!canViewLogs) return null;

  const visits = history?.data ?? [];
  const totalPages = Math.ceil((history?.count ?? 0) / PAGE_SIZE);

  const stats = [
    { label: 'Visits (90 days)', value: summary?.total_visits ?? 0 },
    { label: 'Average stay', value: formatDuration(summary?.avg_duration_minutes) },
    { label: 'Usual gate', value: summary?.most_common_gate || '—' },
    { label: 'Flagged visits', value: summary?.flagged_visits ?? 0 },
  ];

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Visit History
        </CardTitle>
        <CardDescription>Check-ins recorded for this contact</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-lg font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : visits.length > 0 ? (
          <div className="space-y-2">
            {visits.map((visit) => (
              <div
                key={visit.id}
                className="flex items-center justify-between text-sm border-b pb-2 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span>{new Date(visit.check_in_time).toLocaleString()}</span>
                  {visit.flagged && <Badge variant="destructive">Flagged</Badge>}
                </div>
                <div className="flex items-center gap-3 text-muted-foreground text-xs">
                  {visit.vehicle?.plate_number && (
                    <span className="font-mono">{visit.vehicle.plate_number}</span>
                  )}
                  {visit.gate_location && <span>{visit.gate_location}</span>}
                  <span>
                    {visit.check_out_time
                      ? formatDuration(visit.actual_duration_minutes)
                      : 'Still inside'}
                  </span>
                </div>
              </div>
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No visits recorded yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
