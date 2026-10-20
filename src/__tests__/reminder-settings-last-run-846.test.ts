/**
 * #846: the cron no longer writes invoice_reminder_last_run (it has no session), so the
 * Reminders page's Last Run comes from the latest cron:payment-reminders System Action Log row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getReminderSettings } from '@/actions/notifications/reminder-config';

const m = vi.hoisted(() => ({
  rows: [] as { source: string; occurred_at: string }[],
  tables: [] as string[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) => {
      m.tables.push(table);
      let rows = m.rows;
      const q = {
        select: () => q,
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
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));

beforeEach(() => {
  m.rows = [];
  m.tables = [];
});

describe('getReminderSettings lastRun', () => {
  it('is the newest cron:payment-reminders run in the System Action Log', async () => {
    m.rows = [
      { source: 'cron:payment-reminders', occurred_at: '2026-10-18T07:00:00Z' },
      { source: 'cron:payment-reminders', occurred_at: '2026-10-19T07:00:00Z' },
      { source: 'cron:process-notifications', occurred_at: '2026-10-20T07:00:00Z' },
    ];
    expect((await getReminderSettings()).lastRun).toBe('2026-10-19T07:00:00Z');
    expect(m.tables).toContain('system_action_log');
  });

  it('is null when the cron has never run, ignoring the stale last-run setting', async () => {
    m.rows = [{ source: 'cron:process-notifications', occurred_at: '2026-10-20T07:00:00Z' }];
    expect((await getReminderSettings()).lastRun).toBeNull();
  });
});
