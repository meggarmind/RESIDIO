/**
 * #846: the cron no longer writes invoice_reminder_last_run (it has no session), so the
 * Reminders page's Last Run comes from the latest cron:payment-reminders System Action Log row,
 * read with the service role so a notifications manager without system.view_system_log sees it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getReminderSettings } from '@/actions/notifications/reminder-config';

const m = vi.hoisted(() => ({
  rows: [] as { source: string; occurred_at: string }[],
  tables: [] as string[],
  columns: [] as string[],
  authorized: true,
}));

vi.mock('@/lib/supabase/server', () => ({
  // The session client sees no System Action Log rows, as RLS gives a non-super-admin manager.
  createServerSupabaseClient: async () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: [], error: null }) };
      return q;
    },
  }),
  createAdminClient: () => ({
    from: (table: string) => {
      m.tables.push(table);
      let rows = m.rows;
      const q = {
        select: (columns: string) => (m.columns.push(columns), q),
        eq: (col: 'source', value: string) => ((rows = rows.filter((r) => r[col] === value)), q),
        order: (col: 'occurred_at', { ascending }: { ascending: boolean }) => (
          (rows = [...rows].sort((a, b) => (ascending ? 1 : -1) * a[col].localeCompare(b[col]))), q
        ),
        limit: async (n: number) => ({ data: rows.slice(0, n), error: null }),
      };
      return q;
    },
  }),
}));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: async () => '2020-01-01T00:00:00Z' }));
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: async () => null }));
vi.mock('@/actions/settings/update-setting', () => ({ updateSetting: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: async (permission: string) =>
    m.authorized && permission === 'notifications.manage'
      ? { authorized: true, userId: 'u1', roleId: 'r1', roleName: 'admin', error: null }
      : { authorized: false, userId: null, roleId: null, roleName: null, error: 'Unauthorized' },
}));

beforeEach(() => {
  m.rows = [];
  m.tables = [];
  m.columns = [];
  m.authorized = true;
});

describe('getReminderSettings lastRun', () => {
  it('is the newest cron:payment-reminders run for a non-super-admin notifications manager', async () => {
    m.rows = [
      { source: 'cron:payment-reminders', occurred_at: '2026-10-18T07:00:00Z' },
      { source: 'cron:payment-reminders', occurred_at: '2026-10-19T07:00:00Z' },
      { source: 'cron:process-notifications', occurred_at: '2026-10-20T07:00:00Z' },
    ];
    expect((await getReminderSettings()).lastRun).toBe('2026-10-19T07:00:00Z');
    expect(m.tables).toContain('system_action_log');
    expect(m.columns).toEqual(['occurred_at']);
  });

  it('is null without notifications.manage, and the log is not read', async () => {
    m.authorized = false;
    m.rows = [{ source: 'cron:payment-reminders', occurred_at: '2026-10-19T07:00:00Z' }];
    expect((await getReminderSettings()).lastRun).toBeNull();
    expect(m.tables).not.toContain('system_action_log');
  });

  it('is null when the cron has never run, ignoring the stale last-run setting', async () => {
    m.rows = [{ source: 'cron:process-notifications', occurred_at: '2026-10-20T07:00:00Z' }];
    expect((await getReminderSettings()).lastRun).toBeNull();
  });
});
