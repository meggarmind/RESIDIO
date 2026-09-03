import { describe, expect, it, vi } from 'vitest';

import { PERMISSIONS } from '@/lib/auth/action-roles';
import {
  filterVisibleCards,
  getPendingAccountsStatus,
  getQueueDepthStatus,
  type PermissionGated,
} from './system-status';

interface TestCard extends PermissionGated {
  id: string;
}

describe('getQueueDepthStatus', () => {
  it('is healthy when nothing is pending or failed', () => {
    expect(getQueueDepthStatus({ pending: 0, failed: 0 })).toBe('healthy');
  });

  it('stays healthy for a small pending count', () => {
    expect(getQueueDepthStatus({ pending: 5, failed: 0 })).toBe('healthy');
  });

  it('escalates to warning once the backlog crosses the warning threshold', () => {
    expect(getQueueDepthStatus({ pending: 25, failed: 0 })).toBe('warning');
    expect(getQueueDepthStatus({ pending: 99, failed: 0 })).toBe('warning');
  });

  it('escalates to critical once the backlog crosses the critical threshold', () => {
    expect(getQueueDepthStatus({ pending: 100, failed: 0 })).toBe('critical');
  });

  it('is critical the moment anything has failed, even with a small pending count', () => {
    // A failure means a notification did not go out — worse than a large
    // but still-moving backlog, so this does not wait for a threshold.
    expect(getQueueDepthStatus({ pending: 1, failed: 1 })).toBe('critical');
    expect(getQueueDepthStatus({ pending: 0, failed: 1 })).toBe('critical');
  });
});

describe('getPendingAccountsStatus', () => {
  it('is healthy when nothing is waiting', () => {
    expect(getPendingAccountsStatus(0)).toBe('healthy');
  });

  it('is a warning for any non-zero backlog below the critical threshold', () => {
    expect(getPendingAccountsStatus(1)).toBe('warning');
    expect(getPendingAccountsStatus(9)).toBe('warning');
  });

  it('escalates to critical once the backlog crosses the critical threshold', () => {
    expect(getPendingAccountsStatus(10)).toBe('critical');
    expect(getPendingAccountsStatus(50)).toBe('critical');
  });
});

describe('filterVisibleCards', () => {
  it('keeps a card with no permissions listed regardless of what the viewer holds', () => {
    const cards: TestCard[] = [{ id: 'data-tools' }];
    const hasAnyPermission = vi.fn(() => false);

    expect(filterVisibleCards(cards, hasAnyPermission)).toEqual(cards);
    expect(hasAnyPermission).not.toHaveBeenCalled();
  });

  it('keeps a card whose permission the viewer holds', () => {
    const cards = [{ id: 'cron', permissions: [PERMISSIONS.SYSTEM_MONITOR] }];
    const hasAnyPermission = vi.fn(() => true);

    expect(filterVisibleCards(cards, hasAnyPermission)).toEqual(cards);
    expect(hasAnyPermission).toHaveBeenCalledWith([PERMISSIONS.SYSTEM_MONITOR]);
  });

  it('drops a card whose permission the viewer lacks', () => {
    const cards = [{ id: 'accounts', permissions: [PERMISSIONS.SYSTEM_ASSIGN_ROLES] }];
    const hasAnyPermission = vi.fn(() => false);

    expect(filterVisibleCards(cards, hasAnyPermission)).toEqual([]);
  });

  it('filters each card independently, matching a viewer who holds only some of the six guards', () => {
    const cards = [
      { id: 'cron', permissions: [PERMISSIONS.SYSTEM_MONITOR] },
      { id: 'queue', permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
      { id: 'audit', permissions: [PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS] },
      { id: 'accounts', permissions: [PERMISSIONS.SYSTEM_ASSIGN_ROLES] },
      { id: 'data-tools', permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
    ];
    // Holds only the notification queue and data tools permissions.
    const held = new Set<string>([
      PERMISSIONS.NOTIFICATIONS_MANAGE,
      PERMISSIONS.SETTINGS_MANAGE_GENERAL,
    ]);
    const hasAnyPermission = (permissions: string[]) => permissions.some((p) => held.has(p));

    expect(filterVisibleCards(cards, hasAnyPermission).map((c) => c.id)).toEqual([
      'queue',
      'data-tools',
    ]);
  });
});
