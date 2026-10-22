import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/** #984: the indebtedness report carries the shared debt status (#980). */

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
