'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { CommandLane, type LaneState, type LaneTone } from '@/components/dashboard/command-lane';
import type { DashboardActionMetrics, QuickStats, SecurityAlerts } from '@/actions/dashboard/get-enhanced-dashboard-stats';

interface SecurityLaneProps {
  actionMetrics: DashboardActionMetrics | null;
  securityAlerts?: SecurityAlerts | null;
  quickStats: QuickStats | null;
  asOf?: string | null;
  isLoading?: boolean;
  isUnavailable?: boolean;
}

// The snapshot carries no per-House access flags, so this lane reports contacts and codes only.
export function SecurityLane({
  actionMetrics,
  securityAlerts,
  quickStats,
  asOf,
  isLoading = false,
  isUnavailable = false,
}: SecurityLaneProps) {
  const { hasPermission } = useAuth();
  const state: LaneState = isLoading ? 'loading' : isUnavailable || !actionMetrics ? 'unavailable' : 'ready';
  const expiring = actionMetrics?.expiringSecurityContacts ?? 0;
  const tone: LaneTone = expiring > 0 ? 'attention' : 'ok';

  return (
    <CommandLane
      testId="lane-security"
      title="Security and Access"
      state={state}
      tone={tone}
      asOf={asOf}
      heroLabel="Contacts expiring soon"
      heroValue={actionMetrics ? String(expiring) : null}
      status={
        <span className="block text-foreground">
          {quickStats ? `${quickStats.activeSecurityContacts} of ${quickStats.totalSecurityContacts} contacts active` : 'Contact totals unavailable'}
        </span>
      }
      rows={[
        { key: 'expired', label: 'Expired access codes', value: securityAlerts ? String(securityAlerts.expiredCodesCount) : null },
        { key: 'suspended', label: 'Suspended contacts', value: securityAlerts ? String(securityAlerts.suspendedContactsCount) : null },
        { key: 'flagged', label: 'Recent flagged entries', value: securityAlerts ? String(securityAlerts.recentFlaggedEntries) : null },
      ]}
      primary={{ label: 'Open security contacts', href: '/security/contacts', allowed: hasPermission(PERMISSIONS.SECURITY_VIEW) }}
      secondary={[
        { label: 'Add security contact', href: '/security/contacts/new', allowed: hasPermission(PERMISSIONS.SECURITY_REGISTER_CONTACTS) },
      ]}
    />
  );
}
