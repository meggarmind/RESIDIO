import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/** #984: the indebtedness report and the ranking carry the shared debt status (#980). */

const mocks = vi.hoisted(() => ({ getDebtStatuses: vi.fn(), client: { current: null as unknown } }));

vi.mock('@/lib/billing/debt-status', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/debt-status')>()),
  getDebtStatuses: mocks.getDebtStatuses,
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => mocks.client.current,
  createAdminClient: () => mocks.client.current,
}));

import { generateIndebtednessReport } from '@/lib/reports/report-generator';
import { getIndebtednessAnalytics } from '@/actions/analytics/get-indebtedness-rankings';
import { IndebtednessRankingTable } from '@/components/analytics/indebtedness-ranking-table';
import { TraditionalTemplate } from '@/components/reports/templates/traditional-template';

const status = (houseId: string, s: string, label: string) => ({ houseId, residentId: null, status: s, label, owedInvoiceCount: 0, walletBalance: 0 });

function table(data: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'in', 'neq']) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res);
  return q;
}

describe('generateIndebtednessReport', () => {
  it('gives each house its shared status and label, and keeps the amount', async () => {
    const rh = (id: string) => [{ resident_id: id, resident_role: 'tenant', is_active: true, resident: { id, first_name: 'A', last_name: id } }];
    const houses = [
      { id: 'h1', house_number: '1', street: { id: 's', name: 'Main' }, resident_houses: rh('r1') },
      { id: 'h2', house_number: '2', street: { id: 's', name: 'Main' }, resident_houses: rh('r2') },
    ];
    const invoices = [{ house_id: 'h1', amount_due: 100, amount_paid: 40, status: 'unpaid' }];
    mocks.client.current = { from: (t: string) => table(t === 'houses' ? houses : invoices) };
    mocks.getDebtStatuses.mockResolvedValue([status('h1', 'arrears', 'Owing'), status('h2', 'credit', 'Credit')]);

    const out = await generateIndebtednessReport(mocks.client.current as never, false, true);
    expect(out.houses.map((h) => [h.houseId, h.status, h.statusLabel, h.outstandingAmount])).toEqual([
      ['h1', 'arrears', 'Owing', 60],
      ['h2', 'credit', 'Credit', 0],
    ]);
    expect(out.summary).toMatchObject({ totalHouses: 2, indebtedCount: 1, nonIndebtedCount: 1, totalOutstanding: 60 });

    const props = { data: out, report: { type: 'indebtedness_summary', data: out } } as unknown as React.ComponentProps<typeof TraditionalTemplate>;
    const html = renderToStaticMarkup(<TraditionalTemplate {...props} />);
    expect(html).toContain('Owing');
  });
});

describe('getIndebtednessAnalytics', () => {
  it('attaches the house status to ranked residents and keeps the order', async () => {
    const inv = (rid: string, hid: string, due: number) => ({
      resident_id: rid, house_id: hid, amount_due: due, amount_paid: 0,
      resident: { id: rid, first_name: 'N', last_name: rid, resident_code: rid },
      house: { house_number: '1', street_id: null, house_type_id: null, street: { name: 'Main' } },
    });
    mocks.client.current = { from: (t: string) => table(t === 'invoices' ? [inv('r1', 'h1', 50), inv('r2', 'h2', 200)] : []) };
    mocks.getDebtStatuses.mockImplementation(async (_c: unknown, p: { residentId: string }) =>
      p.residentId === 'r2'
        ? [{ ...status('h2', 'arrears', 'Arrears'), owedInvoiceCount: 4 }]
        : [{ ...status('h1', 'outstanding', 'Outstanding'), owedInvoiceCount: 1 }],
    );

    const { data } = await getIndebtednessAnalytics();
    expect(data!.topIndebted.map((r) => [r.residentId, r.outstanding, r.status])).toEqual([
      ['r2', 200, 'arrears'],
      ['r1', 50, 'outstanding'],
    ]);
  });

  it('combines a resident with invoices in two houses into one status', async () => {
    const inv = (hid: string) => ({
      resident_id: 'r1', house_id: hid, amount_due: 10, amount_paid: 0,
      resident: { id: 'r1', first_name: 'N', last_name: 'r1', resident_code: 'r1' },
      house: { house_number: hid, street_id: null, house_type_id: null, street: { name: 'Main' } },
    });
    mocks.client.current = { from: (t: string) => table(t === 'invoices' ? [inv('hA'), inv('hB')] : []) };
    mocks.getDebtStatuses.mockResolvedValue([
      { ...status('hA', 'outstanding', 'x'), owedInvoiceCount: 2 },
      { ...status('hB', 'outstanding', 'x'), owedInvoiceCount: 2 },
    ]);

    const { data } = await getIndebtednessAnalytics();
    expect(mocks.getDebtStatuses).toHaveBeenLastCalledWith(mocks.client.current, { houseIds: ['hA', 'hB'], residentId: 'r1' });
    expect(data!.topIndebted).toHaveLength(1);
    expect(data!.topIndebted[0]).toMatchObject({ status: 'arrears', statusLabel: 'Arrears' });
  });

  it('table shows the status label', () => {
    const html = renderToStaticMarkup(
      <IndebtednessRankingTable title="t" variant="top" data={[{ residentId: 'r', residentName: 'N', residentCode: 'c', houseNumber: '1', streetName: 'M', outstanding: 5, status: 'arrears', statusLabel: 'Arrears' }]} />,
    );
    expect(html).toContain('Arrears');
  });
});
