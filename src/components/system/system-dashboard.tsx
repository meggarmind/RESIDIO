'use client';

/**
 * System dashboard body: cards for the five subjects ADR-0004 moved out of
 * Settings, laid out so a healthy state and a bad one look different at a
 * glance. Extracted from the page component so the permission-filtering and
 * status logic it depends on (`system-status.ts`) can be unit tested without
 * mounting this component.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, History, ListTodo, UserCog } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-provider';
import { PERMISSIONS, type Permission } from '@/lib/auth/action-roles';
import { getAuditStats } from '@/actions/audit';
import { getPendingAccounts } from '@/actions/auth/account-approval';
import { getQueueStatistics } from '@/actions/notifications/queue';
import { notificationKeys } from '@/hooks/use-notifications';
import { POLLING_INTERVALS } from '@/lib/config/polling';
import { CronHealthCard } from '@/components/dashboard/cron-health-card';
import { StatusCard } from './status-card';
import { filterVisibleCards, getPendingAccountsStatus, getQueueDepthStatus } from './system-status';

interface CardDef {
  id: 'cron' | 'queue' | 'audit' | 'accounts' | 'data-tools';
  permissions: Permission[];
}

/**
 * One entry per card, each guarded by the same permission its own page is
 * guarded by in `ROUTE_PERMISSIONS` / `navigation.ts` — a viewer who cannot
 * open a page should not see a card teasing it either.
 */
const CARD_DEFS: CardDef[] = [
  { id: 'cron', permissions: [PERMISSIONS.SYSTEM_MONITOR] },
  { id: 'queue', permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
  { id: 'audit', permissions: [PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS] },
  { id: 'accounts', permissions: [PERMISSIONS.SYSTEM_ASSIGN_ROLES] },
  { id: 'data-tools', permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
];

export function SystemDashboard() {
  const { hasAnyPermission, isLoading: authLoading } = useAuth();

  // While auth is still loading, show every card optimistically (matches
  // useNavigation / useSettingsNavigation) rather than flashing an empty
  // dashboard and then filling it in.
  const visible = useMemo(() => {
    const shown = authLoading ? CARD_DEFS : filterVisibleCards(CARD_DEFS, hasAnyPermission);
    return new Set(shown.map((c) => c.id));
  }, [authLoading, hasAnyPermission]);

  const showQueue = visible.has('queue');
  const showAudit = visible.has('audit');
  const showAccounts = visible.has('accounts');

  // Fetched directly against the server actions (rather than through the
  // shared use-notifications/use-audit-logs/use-pending-accounts hooks) so
  // each query can be gated with `enabled` on the viewer's own permission.
  // As of #181, `getQueueStatistics()` also checks `notifications.manage`
  // itself, so this `enabled` gate is defence-in-depth rather than the only
  // boundary — it still avoids firing (and toasting an error for) a request
  // the viewer's role can't complete, and keeps this dashboard consistent
  // with the other four cards.
  const queueQuery = useQuery({
    queryKey: notificationKeys.queueStats(),
    queryFn: async () => {
      const { data, error } = await getQueueStatistics();
      if (error) throw new Error(error);
      return data;
    },
    enabled: showQueue,
    refetchInterval: POLLING_INTERVALS.REALTIME,
  });

  const auditQuery = useQuery({
    queryKey: ['audit-stats'],
    queryFn: async () => {
      const result = await getAuditStats();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: showAudit,
    refetchInterval: POLLING_INTERVALS.REALTIME,
  });

  const accountsQuery = useQuery({
    queryKey: ['pending-accounts'],
    queryFn: async () => {
      const result = await getPendingAccounts();
      if (result.error) throw new Error(result.error);
      return result.accounts;
    },
    enabled: showAccounts,
  });

  if (visible.size === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        You don&apos;t have access to any System monitoring tools.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {visible.has('cron') && <CronHealthCard />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {showQueue && (
          <StatusCard
            title="Notification Queue"
            description="Messages waiting to send"
            href="/system/notification-queue"
            icon={ListTodo}
            isLoading={queueQuery.isLoading}
            errorMessage={queueQuery.error ? queueQuery.error.message : null}
            onRetry={() => queueQuery.refetch()}
            status={queueQuery.data ? getQueueDepthStatus(queueQuery.data) : 'neutral'}
            value={queueQuery.data?.pending ?? 0}
            subtext={
              queueQuery.data
                ? `${queueQuery.data.failed} failed · ${queueQuery.data.processing} processing`
                : undefined
            }
          />
        )}

        {showAudit && (
          <StatusCard
            title="Recent Audit Activity"
            description="Actions logged today"
            href="/system/audit-logs"
            icon={History}
            status="neutral"
            isLoading={auditQuery.isLoading}
            errorMessage={auditQuery.error ? auditQuery.error.message : null}
            onRetry={() => auditQuery.refetch()}
            value={auditQuery.data?.today ?? 0}
            subtext={
              auditQuery.data
                ? `${auditQuery.data.thisWeek} this week · ${auditQuery.data.thisMonth} this month`
                : undefined
            }
          />
        )}

        {showAccounts && (
          <StatusCard
            title="Accounts Awaiting Approval"
            description="New sign-ups needing review"
            href="/system/accounts?tab=pending"
            icon={UserCog}
            isLoading={accountsQuery.isLoading}
            errorMessage={accountsQuery.error ? accountsQuery.error.message : null}
            onRetry={() => accountsQuery.refetch()}
            status={
              accountsQuery.data ? getPendingAccountsStatus(accountsQuery.data.length) : 'neutral'
            }
            value={accountsQuery.data?.length ?? 0}
            subtext={
              accountsQuery.data && accountsQuery.data.length > 0
                ? 'Waiting for a role decision'
                : undefined
            }
          />
        )}

        {visible.has('data-tools') && (
          <StatusCard
            title="Data Tools"
            description="Administrative data utilities"
            href="/system/data-tools"
            icon={Archive}
            status="neutral"
            subtext="Ownership history backfill"
          />
        )}
      </div>
    </div>
  );
}
