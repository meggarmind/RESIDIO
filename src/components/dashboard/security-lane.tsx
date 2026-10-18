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
  const problems: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) problems.push(`${n} ${n === 1 ? one : many}`);
  };
  add(expiring, 'contact expiring soon', 'contacts expiring soon');
  add(securityAlerts?.expiredCodesCount ?? 0, 'expired access code', 'expired access codes');
  add(securityAlerts?.suspendedContactsCount ?? 0, 'suspended contact', 'suspended contacts');
  add(securityAlerts?.recentFlaggedEntries ?? 0, 'flagged entry', 'flagged entries');
  // Healthy only when every figure the lane shows is zero. Without the alert figures it cannot judge.
  const tone: LaneTone = problems.length > 0 ? 'attention' : securityAlerts ? 'ok' : 'neutral';

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
        <>
          <span className="block text-foreground">
            {quickStats ? `${quickStats.activeSecurityContacts} of ${quickStats.totalSecurityContacts} contacts active` : 'Contact totals unavailable'}
          </span>
          <span data-testid="lane-security-summary" className="block text-foreground">
            {problems.length > 0
              ? `Needs attention: ${problems.join(', ')}`
              : securityAlerts
                ? 'No expiring contacts, expired codes, suspended contacts or flagged entries'
                : 'Access code and suspension figures unavailable'}
          </span>
        </>
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
