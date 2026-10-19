'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResidentRoleBadge } from '@/components/residents/status-badge';
import { useOwnershipHistory } from '@/hooks/use-houses';
import { RESIDENT_ROLE_LABELS } from '@/types/database';
import type { ResidentRole } from '@/types/database';
import {
  ArrowRightLeft,
  Calendar,
  History,
  Home,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Repeat,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';

const EVENTS: Record<string, { label: string; icon: LucideIcon }> = {
  house_added: { label: 'Added to Portal', icon: Home },
  ownership_start: { label: 'Ownership Started', icon: KeyRound },
  ownership_transfer: { label: 'Ownership Transferred', icon: ArrowRightLeft },
  ownership_end: { label: 'Ownership Ended', icon: UserMinus },
  move_in: { label: 'Move In', icon: LogIn },
  move_out: { label: 'Move Out', icon: LogOut },
  role_change: { label: 'Role Changed', icon: Repeat },
};

// Fixed locale so the same date reads the same on every admin's machine.
const dateFormatter = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
// Matches getOwnershipHistory's default page size.
const HISTORY_PAGE_SIZE = 100;

export const formatHistoryDate = (date: string) => dateFormatter.format(new Date(date));

/** Ownership and occupancy timeline. Mounted only while the History tab is open, so its query runs only then. */
export function HistoryTimeline({ houseId }: { houseId: string }) {
  const { data: ownershipHistory, isLoading } = useOwnershipHistory(houseId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Ownership & Occupancy History
        </CardTitle>
        <CardDescription>Timeline of ownership changes, move-ins, move-outs, and role changes</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !ownershipHistory || ownershipHistory.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">No history records yet</p>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" aria-hidden="true" />
            <ol className="space-y-6">
            {ownershipHistory.map((record) => {
              const event = EVENTS[record.event_type];
              const Icon = event?.icon ?? Calendar;
              const isHouseAddedEvent = record.event_type === 'house_added' || !record.resident;
              const showsRange = record.event_type === 'ownership_start' || record.event_type === 'move_in';

              return (
                <li key={record.id} className="relative pl-12" data-testid="history-event">
                  {/* One neutral dot; the icon carries the event type */}
                  <span className="absolute left-0 flex size-8 items-center justify-center rounded-full border bg-background text-muted-foreground">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>

                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="font-medium text-sm">{event?.label ?? record.event_type}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" aria-hidden="true" />
                        {formatHistoryDate(record.event_date)}
                        {showsRange && ` - ${record.end_date ? formatHistoryDate(record.end_date) : 'Present'}`}
                      </span>
                    </div>

                    {!isHouseAddedEvent && record.resident && (
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Link href={`/residents/${record.resident.id}`} className="font-medium text-primary hover:underline">
                          {record.resident.entity_type === 'corporate' && record.resident.company_name
                            ? record.resident.company_name
                            : `${record.resident.first_name} ${record.resident.last_name}`}
                        </Link>
                        {record.resident_role && <ResidentRoleBadge role={record.resident_role as ResidentRole} />}
                        {record.is_current && <Badge variant="secondary">Current</Badge>}
                      </div>
                    )}

                    {isHouseAddedEvent && <p className="text-sm text-muted-foreground mb-2">House added to Residio portal</p>}

                    {record.previous_role && (
                      <p className="text-sm text-muted-foreground mb-1">
                        Previous role: {RESIDENT_ROLE_LABELS[record.previous_role as ResidentRole]}
                      </p>
                    )}

                    {record.notes && !isHouseAddedEvent && <p className="text-sm text-muted-foreground">{record.notes}</p>}
                  </div>
                </li>
              );
            })}
            </ol>
            {ownershipHistory.length >= HISTORY_PAGE_SIZE && (
              <p className="mt-4 text-xs text-muted-foreground text-center">Showing the latest {HISTORY_PAGE_SIZE} events.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
