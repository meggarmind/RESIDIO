import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  settings: [] as Array<{ key: string; value: unknown; category: string }>,
  counts: {} as Record<string, number>,
  from: vi.fn(),
}));

/** Resolves whatever chain the action builds to the fixture for that table. */
function query(table: string) {
  const result =
    table === 'system_settings'
      ? { data: mocks.settings, error: null }
      : { data: null, count: mocks.counts[table] ?? 0, error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    or: () => chain,
    eq: () => chain,
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

  it('reports an empty estate as having done only the defaults', async () => {
    mocks.settings = [
      { key: 'email_enabled', value: false, category: 'email' },
      { key: 'invoice_reminders_enabled', value: false, category: 'notifications' },
    ];
    const { data } = await getSetupStatus();
    expect(summarizeSetup(data!).done).toBe(0);
  });

  it('reports a complete estate as complete', async () => {
    mocks.settings = [
      { key: 'estate_name', value: 'Palm Grove', category: 'general' },
      { key: 'estate_address', value: '1 Palm Way', category: 'general' },
      { key: 'billing_due_day', value: 5, category: 'billing' },
      {
        key: 'invoice_reminder_schedule',
        value: { isActive: true, steps: [{ isActive: true }] },
        category: 'notifications',
      },
    ];
    mocks.counts = { streets: 2, house_types: 1, estate_bank_accounts: 1, billing_profiles: 3, profiles: 1 };
    const { data } = await getSetupStatus();
    expect(summarizeSetup(data!).complete).toBe(true);
  });

  it('does not count a blank estate name or a schedule with every step off', async () => {
    mocks.settings = [
      { key: 'estate_name', value: '  ', category: 'general' },
      { key: 'estate_address', value: '1 Palm Way', category: 'general' },
      { key: 'invoice_reminder_schedule', value: JSON.stringify({ steps: [{ isActive: false }] }), category: 'x' },
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
