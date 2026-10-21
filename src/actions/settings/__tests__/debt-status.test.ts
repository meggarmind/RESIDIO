import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEBT_STATUS_DEFAULTS, type DebtStatusSettings } from '@/lib/billing/debt-status';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  storedRows: [] as { key: string; value: unknown }[],
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ from: mocks.from }),
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { updateDebtStatusSettings } from '@/actions/settings/debt-status';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storedRows = [
    { key: 'debt_status_label_arrears', value: 'Arrears' },
    { key: 'debt_status_arrears_threshold_months', value: 3 },
  ];
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.upsert.mockImplementation((rows: { key: string; value: unknown }[]) => ({
    select: async () => ({ data: rows.map((r, i) => ({ id: `id-${i}`, key: r.key })), error: null }),
  }));
  mocks.from.mockImplementation(() => ({
    select: () => ({ in: async () => ({ data: mocks.storedRows, error: null }) }),
    upsert: mocks.upsert,
  }));
});

const input = (change: Partial<DebtStatusSettings> = {}): DebtStatusSettings => ({ ...DEBT_STATUS_DEFAULTS, ...change });

describe('updateDebtStatusSettings (#980)', () => {
  it('checks settings.manage_debt_status first and writes nothing when refused', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });
    expect(await updateDebtStatusSettings(input())).toEqual({ data: null, error: 'Forbidden' });
    expect(mocks.authorizePermission).toHaveBeenCalledWith('settings.manage_debt_status');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('refuses an invalid value before touching the database', async () => {
    const result = await updateDebtStatusSettings(input({ arrearsThresholdMonths: 0 }));
    expect(result.error).toMatch(/whole number of months from 1 to 24/);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('refuses two statuses sharing a label', async () => {
    const result = await updateDebtStatusSettings(input({ labels: { ...DEBT_STATUS_DEFAULTS.labels, credit: 'arrears ' } }));
    expect(result.error).toBe('Each debt status needs its own label');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('saves every key in the billing category, trimmed, and audits only what changed', async () => {
    const result = await updateDebtStatusSettings(
      input({ labels: { ...DEBT_STATUS_DEFAULTS.labels, arrears: ' Owing ' }, arrearsThresholdMonths: 3 }),
    );
    expect(result.error).toBeNull();
    const rows = mocks.upsert.mock.calls[0][0] as { key: string; value: unknown; category: string }[];
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.category === 'billing')).toBe(true);
    expect(rows).toContainEqual({ key: 'debt_status_label_arrears', value: 'Owing', category: 'billing' });
    expect(mocks.upsert.mock.calls[0][1]).toEqual({ onConflict: 'key' });

    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.logAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ action: 'UPDATE', entityType: 'system_settings', entityId: 'id-0' });
    expect(audit.oldValues.debt_status_label_arrears).toBe('Arrears');
    expect(audit.newValues.debt_status_label_arrears).toBe('Owing');
    // Unchanged threshold is not reported; keys never stored before are.
    expect(audit.newValues).not.toHaveProperty('debt_status_arrears_threshold_months');
    expect(audit.newValues).toHaveProperty('debt_status_report_footnote');
  });

  it('writes no audit row when nothing changed', async () => {
    mocks.storedRows = [
      ...Object.entries(DEBT_STATUS_DEFAULTS.labels).map(([s, value]) => ({ key: `debt_status_label_${s}`, value })),
      { key: 'debt_status_arrears_threshold_months', value: 3 },
      { key: 'debt_status_report_footnote', value: DEBT_STATUS_DEFAULTS.reportFootnote },
      { key: 'debt_status_chat_pdf_house_limit', value: '40' },
    ];
    expect((await updateDebtStatusSettings(input())).error).toBeNull();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});
