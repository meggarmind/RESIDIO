import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  settings: [] as Array<{ key: string; value: unknown }>,
  counts: {} as Record<string, number>,
  from: vi.fn(),
}));

/** Resolves whatever chain the action builds to the fixture for that table. */
function query(table: string) {
  let keys: string[] | null = null;
  const result = () =>
    table === 'system_settings'
      ? { data: mocks.settings.filter((r) => !keys || keys.includes(r.key)), error: null }
      : { data: null, count: mocks.counts[table] ?? 0, error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: (_column: string, values: string[]) => {
      keys = values;
      return chain;
    },
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));

import { getSetupStatus } from '@/actions/settings/get-setup-status';
import { summarizeSetup } from '@/lib/settings/setup-checklist';

/** Rows as the migrations leave them, in the JSON shapes they were seeded with; email is seeded on. */
const seededBilling = () => [
  { key: 'email_enabled', value: 'true' },
  { key: 'bill_vacant_houses', value: false },
  { key: 'auto_generate_levies', value: true },
  { key: 'invoice_due_window_days', value: '30' },
  { key: 'late_fee_type', value: 'percentage' },
  { key: 'grace_period_days', value: 7 },
  { key: 'payment_reminder_days', value: [7, 3, 1] },
  { key: 'current_development_levy_profile_id', value: '6b1f0c2e-0000-4000-8000-000000000000' },
];
const withSetting = (key: string, value: unknown) => [...seededBilling().filter((r) => r.key !== key), { key, value }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.from.mockImplementation(query);
  mocks.settings = [];
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

  it('reports a freshly migrated estate as 1 of N done: only the notification channel, because email is seeded on', async () => {
    mocks.settings = seededBilling();
    const { data } = await getSetupStatus();
    const summary = summarizeSetup(data!);
    expect(summary.done).toBe(1);
    expect(summary.total).toBeGreaterThan(1);
    expect(data!.notificationChannel).toBe(true);
    expect(data!.billingSettings).toBe(false);
  });

  it('reports an estate with no settings rows at all as 0 of N done', async () => {
    const { data } = await getSetupStatus();
    expect(summarizeSetup(data!).done).toBe(0);
  });

  it('marks billing done once a billing setting differs from its seeded default', async () => {
    mocks.settings = withSetting('invoice_due_window_days', '14');
    expect((await getSetupStatus()).data!.billingSettings).toBe(true);

    mocks.settings = withSetting('bill_vacant_houses', 'true');
    expect((await getSetupStatus()).data!.billingSettings).toBe(true);

    mocks.settings = withSetting('payment_reminder_days', [5, 1]);
    expect((await getSetupStatus()).data!.billingSettings).toBe(true);
  });

  it('treats a default saved back as a string as unchanged', async () => {
    mocks.settings = withSetting('grace_period_days', '7');
    expect((await getSetupStatus()).data!.billingSettings).toBe(false);
  });

  it('marks a channel done when email, SMS or WhatsApp is on', async () => {
    mocks.settings = seededBilling();
    expect((await getSetupStatus()).data!.notificationChannel).toBe(true);

    mocks.settings = withSetting('email_enabled', 'false');
    expect((await getSetupStatus()).data!.notificationChannel).toBe(false);

    mocks.settings = [{ key: 'email_enabled', value: false }, { key: 'invoice_reminder_whatsapp_enabled', value: 'true' }];
    expect((await getSetupStatus()).data!.notificationChannel).toBe(true);
  });

  it('marks reminders done only with an active schedule that is not switched off', async () => {
    const schedule = { key: 'invoice_reminder_schedule', value: JSON.stringify({ isActive: true, steps: [{ isActive: true }] }) };
    mocks.settings = [schedule];
    expect((await getSetupStatus()).data!.reminderSchedule).toBe(true);

    mocks.settings = [schedule, { key: 'invoice_reminders_enabled', value: 'false' }];
    expect((await getSetupStatus()).data!.reminderSchedule).toBe(false);

    mocks.settings = [{ key: 'invoice_reminders_enabled', value: 'true' }];
    expect((await getSetupStatus()).data!.reminderSchedule).toBe(false);
  });

  it('reports a complete estate as complete', async () => {
    mocks.settings = [
      ...withSetting('late_fee_type', 'fixed'),
      { key: 'estate_name', value: 'Palm Grove' },
      { key: 'estate_address', value: '1 Palm Way' },
      { key: 'email_enabled', value: 'true' },
      { key: 'invoice_reminder_schedule', value: { isActive: true, steps: [{ isActive: true }] } },
    ];
    mocks.counts = { streets: 2, house_types: 1, estate_bank_accounts: 1, billing_profiles: 3, profiles: 1 };
    const { data } = await getSetupStatus();
    expect(summarizeSetup(data!).complete).toBe(true);
  });

  it('does not count a blank estate name or a schedule with every step off', async () => {
    mocks.settings = [
      { key: 'estate_name', value: '  ' },
      { key: 'estate_address', value: '1 Palm Way' },
      { key: 'invoice_reminder_schedule', value: JSON.stringify({ steps: [{ isActive: false }] }) },
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
