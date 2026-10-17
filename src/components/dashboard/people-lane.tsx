'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { CommandLane, type LaneState, type LaneTone } from '@/components/dashboard/command-lane';
import type { DashboardActionMetrics, QuickStats } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import type { EstateMapSnapshot } from '@/types/estate-map';

interface PeopleLaneProps {
  actionMetrics: DashboardActionMetrics | null;
  quickStats: QuickStats | null;
  /** Supplied by the estate map slice. Null or absent hides the houses-paid-up line. */
  estateMapCounts?: EstateMapSnapshot['counts'] | null;
  asOf?: string | null;
  isLoading?: boolean;
  isUnavailable?: boolean;
}

export function PeopleLane({
  actionMetrics,
  quickStats,
  estateMapCounts,
  asOf,
  isLoading = false,
  isUnavailable = false,
}: PeopleLaneProps) {
  const { hasPermission } = useAuth();
  const state: LaneState = isLoading ? 'loading' : isUnavailable || !actionMetrics ? 'unavailable' : 'ready';
  const awaiting = actionMetrics?.pendingResidentVerifications ?? 0;
  const overdueHouses = estateMapCounts ? estateMapCounts.overdue : 0;
  const tone: LaneTone = awaiting > 0 || overdueHouses > 0 ? 'attention' : quickStats ? 'ok' : 'neutral';

  const mapTotal = estateMapCounts
    ? estateMapCounts.paid_up + estateMapCounts.outstanding + estateMapCounts.overdue + estateMapCounts.no_invoice
    : 0;

  return (
    <CommandLane
      testId="lane-people"
      title="People and Houses"
      state={state}
      tone={tone}
      asOf={asOf}
      heroLabel="Residents awaiting review"
      heroValue={actionMetrics ? String(awaiting) : null}
      status={
        <>
          <span className="block text-foreground">
            {awaiting === 0 ? 'No residents are waiting for review' : 'Residents waiting for a decision'}
          </span>
          {overdueHouses > 0 ? (
            <span data-testid="lane-people-overdue" className="block text-foreground">
              {overdueHouses} {overdueHouses === 1 ? 'house is' : 'houses are'} overdue
            </span>
          ) : null}
          {estateMapCounts ? (
            <span data-testid="lane-people-paid-up" className="block text-foreground">
              {estateMapCounts.paid_up} of {mapTotal} houses paid up
            </span>
          ) : null}
        </>
      }
      rows={[
        { key: 'active', label: 'Active residents', value: quickStats ? String(quickStats.activeResidents) : null },
        {
          key: 'occupied',
          label: 'Occupied houses',
          value: quickStats ? `${quickStats.occupiedHouses} of ${quickStats.totalHouses}` : null,
        },
        // Vacant is total minus occupied, already readable from the row above, so the overdue count takes its place.
        estateMapCounts
          ? { key: 'overdue-houses', label: 'Overdue houses', value: String(overdueHouses) }
          : { key: 'vacant', label: 'Vacant houses', value: quickStats ? String(quickStats.vacantHouses) : null },
      ]}
      primary={{ label: 'Review residents', href: '/residents', allowed: hasPermission(PERMISSIONS.RESIDENTS_VIEW) }}
      secondary={[
        { label: 'Add resident', href: '/residents/new', allowed: hasPermission(PERMISSIONS.RESIDENTS_CREATE) },
        { label: 'Add house', href: '/houses/new', allowed: hasPermission(PERMISSIONS.HOUSES_CREATE) },
      ]}
    />
  );
}
