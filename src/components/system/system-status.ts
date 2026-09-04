/**
 * Pure status/filtering logic for the System dashboard's cards.
 *
 * Kept free of React and server-action imports on purpose: the mapping from
 * a subject's data to its at-a-glance status, and the permission filter that
 * decides which cards render at all, are the only genuinely unit-testable
 * pieces of this feature — everything else is presentational wiring around
 * server actions that already have their own tests. See system-status.test.ts.
 */

import type { Permission } from '@/lib/auth/action-roles';

/** Visual severity a card can render at a glance. */
export type CardStatus = 'healthy' | 'warning' | 'critical' | 'neutral';

/**
 * A queue depth of 0 should read as healthy; a backlog should visibly
 * escalate before it becomes an outage. A single failed item is surfaced as
 * critical immediately — a failure means a notification did not go out,
 * which is worse than a large-but-moving backlog.
 */
const QUEUE_WARNING_THRESHOLD = 25;
const QUEUE_CRITICAL_THRESHOLD = 100;

export function getQueueDepthStatus(stats: { pending: number; failed: number }): CardStatus {
  if (stats.failed > 0 || stats.pending >= QUEUE_CRITICAL_THRESHOLD) return 'critical';
  if (stats.pending >= QUEUE_WARNING_THRESHOLD) return 'warning';
  return 'healthy';
}

/**
 * Any account sitting in the approval queue is something an admin owes a
 * decision on, so even one is worth flagging rather than treated as
 * background noise. A large backlog escalates further.
 */
const PENDING_ACCOUNTS_CRITICAL_THRESHOLD = 10;

export function getPendingAccountsStatus(count: number): CardStatus {
  if (count <= 0) return 'healthy';
  if (count >= PENDING_ACCOUNTS_CRITICAL_THRESHOLD) return 'critical';
  return 'warning';
}

/** The subset of a nav/card descriptor this filter needs. */
export interface PermissionGated {
  permissions?: Permission[];
}

/**
 * Filters a list of card descriptors down to the ones the current viewer is
 * allowed to open — mirrors the `hasAnyPermission` gate `useNavigation` and
 * `useSettingsNavigation` already apply to sidebar items, applied here to a
 * flat list instead of a permission tree. A card with no `permissions`
 * listed is visible to anyone who can reach the System dashboard at all.
 */
export function filterVisibleCards<T extends PermissionGated>(
  cards: T[],
  hasAnyPermission: (permissions: Permission[]) => boolean
): T[] {
  return cards.filter(
    (card) => !card.permissions || card.permissions.length === 0 || hasAnyPermission(card.permissions)
  );
}
