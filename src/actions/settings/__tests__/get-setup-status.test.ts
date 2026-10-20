import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  settings: [] as Array<{ id: string; key: string; value: unknown; category: string; updated_at?: string }>,
  auditedIds: [] as string[],
  counts: {} as Record<string, number>,
  from: vi.fn(),
}));

/** Resolves whatever chain the action builds to the fixture for that table. */
function query(table: string) {
  let result: unknown =
    table === 'system_settings'
      ? { data: mocks.settings, error: null }
      : { data: null, count: mocks.counts[table] ?? 0, error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    or: () => chain,
    eq: () => chain,
    in: (_column: string, ids: string[]) => {
      result = { data: mocks.auditedIds.filter((id) => ids.includes(id)).map((entity_id) => ({ entity_id })), error: null };
      return chain;
    },
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));

import { getSetupStatus } from '@/actions/settings/get-setup-status';
import { summarizeSetup } from '@/lib/settings/setup-checklist';

/**
 * What the migrations leave behind on a fresh database: seeded rows no admin has saved.
 * invoice_due_window_days was renamed by a later migration, so its updated_at is past its created_at.
 */
const seededRows = () => [
  { id: 'row-vacant', key: 'bill_vacant_houses', value: false, category: 'billing' },
  { id: 'row-window', key: 'invoice_due_window_days', value: 7, category: 'billing', updated_at: '2025-12-13T10:00:00Z' },
  { id: 'row-email', key: 'email_enabled', value: 'true', category: 'email' },
];
const row = (key: string, value: unknown, category: string) => ({ id: `row-${key}`, key, value, category });
/** A row an admin saved through updateSetting: stored as a string and audited against its id. */
const saved = (key: string, value: unknown, category: string) => {
  mocks.auditedIds.push(`row-${key}`);
  return row(key, typeof value === 'boolean' || typeof value === 'number' ? String(value) : value, category);
};
const without = (key: string) => seededRows().filter((r) => r.key !== key);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.from.mockImplementation(query);
  mocks.settings = [];
  mocks.auditedIds = [];
  mocks.counts = {};
});

describe('getSetupStatus (#786)', () => {
  it('refuses without settings.view and reads nothing', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });
    const result = await getSetupStatus();
    expect(result).toEqual({ data: null, error: 'Unauthorized' });
    expect(mocks.authorizePermission).toHaveBeenCalledWith('settings.view');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('reports a freshly migrated estate as 0 of N done', async () => {
    mocks.settings = seededRows();
    const { data } = await getSetupStatus();
    const summary = summarizeSetup(data!);
    expect(summary.done).toBe(0);
    expect(summary.total).toBeGreaterThan(0);
  });

  it('marks billing done once an admin saves a seeded billing row', async () => {
    mocks.settings = [...without('invoice_due_window_days'), saved('invoice_due_window_days', 5, 'billing')];
    const { data } = await getSetupStatus();
    expect(data!.billingSettings).toBe(true);
    expect(data!.notificationChannel).toBe(false);
  });

  it('marks a channel done once email is saved on, or SMS or WhatsApp is switched on', async () => {
    mocks.settings = [...without('email_enabled'), saved('email_enabled', true, 'email')];
    expect((await getSetupStatus()).data!.notificationChannel).toBe(true);

    mocks.auditedIds = [];
    mocks.settings = [...without('email_enabled'), saved('email_enabled', false, 'email')];
    expect((await getSetupStatus()).data!.notificationChannel).toBe(false);

    mocks.auditedIds = [];
    mocks.settings = [...seededRows(), row('invoice_reminder_sms_enabled', 'true', 'notifications')];
    expect((await getSetupStatus()).data!.notificationChannel).toBe(true);
  });

  it('marks reminders done once an active schedule is saved', async () => {
    const schedule = row('invoice_reminder_schedule', JSON.stringify({ isActive: true, steps: [{ isActive: true }] }), 'notifications');
    mocks.settings = [...seededRows(), schedule];
    expect((await getSetupStatus()).data!.reminderSchedule).toBe(true);

    mocks.settings = [...seededRows(), schedule, saved('invoice_reminders_enabled', false, 'notifications')];
    expect((await getSetupStatus()).data!.reminderSchedule).toBe(false);
  });

  it('reports a complete estate as complete', async () => {
    mocks.settings = [
      row('estate_name', 'Palm Grove', 'general'),
      row('estate_address', '1 Palm Way', 'general'),
      saved('invoice_due_window_days', 5, 'billing'),
      saved('email_enabled', true, 'email'),
      row('invoice_reminder_schedule', { isActive: true, steps: [{ isActive: true }] }, 'notifications'),
    ];
    mocks.counts = { streets: 2, house_types: 1, estate_bank_accounts: 1, billing_profiles: 3, profiles: 1 };
    const { data } = await getSetupStatus();
    expect(summarizeSetup(data!).complete).toBe(true);
  });

  it('does not count a blank estate name or a schedule with every step off', async () => {
    mocks.settings = [
      row('estate_name', '  ', 'general'),
      row('estate_address', '1 Palm Way', 'general'),
      row('invoice_reminder_schedule', JSON.stringify({ steps: [{ isActive: false }] }), 'x'),
    ];
    const { data } = await getSetupStatus();
    expect(data!.estate).toBe(false);
    expect(data!.reminderSchedule).toBe(false);
  });

  it('reports a read failure as an error, not as an empty estate', async () => {
    mocks.from.mockImplementation((table: string) =>
      table === 'streets'
        ? { select: () => Promise.resolve({ count: null, error: { message: 'boom' } }) }
        : query(table)
    );
    const result = await getSetupStatus();
    expect(result).toEqual({ data: null, error: 'Failed to load setup status' });
  });
});
