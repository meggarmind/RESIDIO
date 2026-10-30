import { beforeEach, describe, expect, it, vi } from 'vitest';
import { oversightConfig } from '@/config/oversight-nav';
import { summarizeDebtByStreet } from '@/lib/billing/debt-by-street';
import { DEBT_STATUS_DEFAULTS } from '@/lib/billing/debt-status';
import { debtTotalsLine } from '@/components/analytics/debt-status-by-street-chart';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const authorize = vi.fn();
const loadHouses = vi.fn();
const getStatuses = vi.fn();
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: (p: string) => authorize(p) }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/whatsapp/debt-report', () => ({ loadReportableHouses: () => loadHouses() }));
vi.mock('@/lib/billing/debt-status', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/billing/debt-status')>()),
  getDebtStatuses: (...args: unknown[]) => getStatuses(...args),
  readDebtStatusSettings: async () => ({ ...(await importOriginal<typeof import('@/lib/billing/debt-status')>()).DEBT_STATUS_DEFAULTS, labels: { arrears: 'Owing', outstanding: 'Due', paid_in_full: 'Clear', credit: 'Ahead' } }),
}));

import { getDebtStatusByStreet } from '@/actions/analytics/get-debt-status-by-street';

describe('Oversight menu sections (#1347)', () => {
  it('has Dashboard, Reports, Messages, System in that order', () => {
    expect(oversightConfig.map((group) => group.title)).toEqual(['Dashboard', 'Reports', 'Messages', 'System']);
  });

  it('puts the chart pages in Dashboard and the report pages in Reports', () => {
    const hrefs = (title: string) => oversightConfig.find((g) => g.title === title)!.items.map((i) => i.href);
    expect(hrefs('Dashboard')).toEqual(['/system', '/analytics', '/analytics/announcements']);
    expect(hrefs('Reports')).toEqual(['/reports/financial-overview', '/reports']);
  });
});

describe('summarizeDebtByStreet (#1347)', () => {
  const houses = [
    { id: 'a', streetName: 'Ojo Kadiri' },
    { id: 'b', streetName: 'Ojo Kadiri' },
    { id: 'c', streetName: 'Gbolahon Bishi' },
    { id: 'd', streetName: 'Gbolahon Bishi' },
    { id: 'e', streetName: 'Gbolahon Bishi' },
  ];
  const statuses = [
    { houseId: 'a', status: 'arrears' as const },
    { houseId: 'b', status: 'credit' as const },
    { houseId: 'c', status: 'arrears' as const },
    { houseId: 'd', status: 'paid_in_full' as const },
    // 'e' has no status row: left out, as the debt status report leaves it out.
  ];

  it('counts each house once under its street and status, streets in name order', () => {
    const result = summarizeDebtByStreet(houses, statuses, DEBT_STATUS_DEFAULTS.labels, new Date('2026-10-30T08:00:00Z'));
    expect(result.streets).toEqual([
      { streetName: 'Gbolahon Bishi', total: 2, counts: { arrears: 1, outstanding: 0, paid_in_full: 1, credit: 0 } },
      { streetName: 'Ojo Kadiri', total: 2, counts: { arrears: 1, outstanding: 0, paid_in_full: 0, credit: 1 } },
    ]);
    expect(result.totals).toEqual({ arrears: 2, outstanding: 0, paid_in_full: 1, credit: 1 });
    expect(result.totalHouses).toBe(4);
    expect(result.asAt).toBe('2026-10-30T08:00:00.000Z');
  });

  it('writes the totals line in status order with the editable labels', () => {
    const result = summarizeDebtByStreet(houses, statuses, DEBT_STATUS_DEFAULTS.labels);
    expect(debtTotalsLine(result)).toBe('4 houses: Arrears 2 · Outstanding 0 · Paid in Full 1 · Credit 1');
  });
});

describe('getDebtStatusByStreet (#1347)', () => {
  beforeEach(() => {
    authorize.mockReset();
    loadHouses.mockReset();
    getStatuses.mockReset();
  });

  it('refuses a user without reports.view_financial and reads nothing', async () => {
    authorize.mockResolvedValue({ authorized: false, error: 'Unauthorized: no' });
    expect(await getDebtStatusByStreet()).toEqual({ data: null, error: 'Unauthorized: no' });
    expect(authorize).toHaveBeenCalledWith(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    expect(loadHouses).not.toHaveBeenCalled();
  });

  it('counts the reportable houses with the stored labels', async () => {
    authorize.mockResolvedValue({ authorized: true });
    loadHouses.mockResolvedValue([{ id: 'a', streetName: 'Ojo Kadiri' }]);
    getStatuses.mockResolvedValue([{ houseId: 'a', status: 'outstanding' }]);
    const { data, error } = await getDebtStatusByStreet();
    expect(error).toBeNull();
    expect(getStatuses).toHaveBeenCalledWith({}, { houseIds: ['a'] });
    expect(data!.totals.outstanding).toBe(1);
    expect(data!.labels.outstanding).toBe('Due');
  });

  it('returns an error, not an empty chart, when the read fails', async () => {
    authorize.mockResolvedValue({ authorized: true });
    loadHouses.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await getDebtStatusByStreet();
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/could not be read/);
  });
});
