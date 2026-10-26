/**
 * #1192 house setting "Dues paid by landlord": houses.update, audited; and the pure reminder rule.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/audit/logger')>()),
  logAudit: mocks.logAudit,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) chain[m] = vi.fn(() => chain);
      chain.update = vi.fn((values: Record<string, unknown>) => {
        mocks.update(values);
        chain.single = vi.fn(async () => ({ data: { id: HOUSE, house_number: '226', ...values }, error: null }));
        return chain;
      });
      chain.single = vi.fn(async () => ({
        data: { id: HOUSE, house_number: '226', dues_paid_by_landlord: false, dues_reminder_target: 'tenant' },
        error: null,
      }));
      return chain;
    },
  })),
}));

import { updateHouseDuesSetting } from '@/actions/houses/update-house-dues-setting';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { coveredMonths, duesReminderRecipients, joinMonths } from '@/lib/billing/landlord-dues';

const HOUSE = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
});

describe('updateHouseDuesSetting (#1192)', () => {
  it('saves the setting under houses.update and audits the change', async () => {
    const result = await updateHouseDuesSetting(HOUSE, { duesPaidByLandlord: true, duesReminderTarget: 'landlord' });

    expect(result.error).toBeNull();
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.HOUSES_UPDATE);
    expect(mocks.update).toHaveBeenCalledWith({ dues_paid_by_landlord: true, dues_reminder_target: 'landlord' });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE',
      entityType: 'houses',
      entityId: HOUSE,
      oldValues: { dues_paid_by_landlord: false, dues_reminder_target: 'tenant' },
      newValues: { dues_paid_by_landlord: true, dues_reminder_target: 'landlord' },
    }));
  });

  it('refuses without houses.update and writes nothing', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });
    expect(await updateHouseDuesSetting(HOUSE, { duesPaidByLandlord: true, duesReminderTarget: 'both' })).toEqual({ error: 'Forbidden' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('refuses an unknown reminder target', async () => {
    const result = await updateHouseDuesSetting(HOUSE, { duesPaidByLandlord: true, duesReminderTarget: 'caretaker' as 'tenant' });
    expect(result.error).toBe('Invalid house setting');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('duesReminderRecipients (#1192)', () => {
  const flagged = (target: string) => ({ dues_paid_by_landlord: true, dues_reminder_target: target });

  it.each([
    ['tenant', { tenant: true, landlord: false }],
    ['landlord', { tenant: false, landlord: true }],
    ['both', { tenant: true, landlord: true }],
  ])('%s target on a flagged house', (target, expected) => {
    expect(duesReminderRecipients(flagged(target), 'dues')).toEqual(expected);
  });

  it('an unflagged house, a levy and a missing house always remind the payer only', () => {
    const tenantOnly = { tenant: true, landlord: false };
    expect(duesReminderRecipients({ dues_paid_by_landlord: false, dues_reminder_target: 'landlord' }, 'dues')).toEqual(tenantOnly);
    expect(duesReminderRecipients(flagged('landlord'), 'development_levy')).toEqual(tenantOnly);
    expect(duesReminderRecipients(null, 'dues')).toEqual(tenantOnly);
  });

  it('treats an invoice without a category as Dues', () => {
    expect(duesReminderRecipients(flagged('landlord'), null)).toEqual({ tenant: false, landlord: true });
  });
});

describe('coveredMonths (#1192)', () => {
  const invoices = [
    { period_start: '2026-08-01', amount_due: 25000, amount_paid: 25000 },
    { period_start: '2026-09-01', amount_due: 25000, amount_paid: 5000 },
    { period_start: '2026-10-01', amount_due: 25000, amount_paid: 0 },
  ];

  it('spends oldest first, skips paid months, lists a partly paid month', () => {
    expect(coveredMonths(invoices, 20000)).toEqual(['Sep 2026']);
    expect(coveredMonths(invoices, 20001)).toEqual(['Sep 2026', 'Oct 2026']);
    expect(coveredMonths(invoices, 0)).toEqual([]);
  });

  it('joins months as a sentence', () => {
    expect(joinMonths(['Sep 2026', 'Oct 2026', 'Nov 2026'])).toBe('Sep 2026, Oct 2026 and Nov 2026');
    expect(joinMonths(['Oct 2026'])).toBe('Oct 2026');
  });
});
