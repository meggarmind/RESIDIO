import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccountStatement } from '@/actions/billing/get-account-statement';

const { createServerSupabaseClient } = vi.hoisted(() => ({ createServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

type QueryResult = { data: unknown; error: { message: string } | null };

// A thenable, chainable query that records every builder call so the test can read back the
// columns selected and the filters applied.
function createQuery(result: QueryResult) {
  const calls: Array<[string, unknown[]]> = [];
  const query: Record<string, unknown> = {
    then: (resolve: (value: QueryResult) => unknown) => resolve(result),
  };
  for (const method of ['select', 'eq', 'neq', 'or', 'gte', 'lte', 'lt', 'order', 'single']) {
    query[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return query;
    };
  }
  return { query, calls };
}

const RESIDENT = { id: 'r1', first_name: 'ADEGOKE', last_name: 'TUNDE', resident_code: '551277', email: null, phone_primary: null, entity_type: 'individual', company_name: null };

function setup(responses: Record<string, QueryResult[]>) {
  const queries: Array<{ table: string; calls: Array<[string, unknown[]]> }> = [];
  const from = vi.fn((table: string) => {
    const { query, calls } = createQuery(responses[table]?.shift() ?? { data: [], error: null });
    queries.push({ table, calls });
    return query;
  });
  createServerSupabaseClient.mockResolvedValue({ from, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
  return { from, queries };
}

const args = (calls: Array<[string, unknown[]]>, method: string) => calls.filter(([m]) => m === method).map(([, a]) => a);

describe('getAccountStatement', () => {
  beforeEach(() => createServerSupabaseClient.mockReset());

  it('rejects dates that are not plain YYYY-MM-DD before querying', async () => {
    const { from } = setup({});
    const result = await getAccountStatement({ residentId: 'r1', fromDate: '2015-01-01),or(id.neq.0', toDate: '2026-10-19' });
    expect(result).toEqual({ data: null, error: 'Dates must be in YYYY-MM-DD format' });
    expect(from).not.toHaveBeenCalled();
  });

  it('selects reference_number, filters invoices by period, and nets mirrored wallet credits out', async () => {
    const { queries } = setup({
      residents: [{ data: RESIDENT, error: null }],
      invoices: [
        { data: [{ id: 'i1', invoice_number: 'LEGACY-IBB-1-2015-01', amount_due: 5000, status: 'paid', invoice_type: 'SERVICE_CHARGE', period_start: '2015-01-01', period_end: '2015-01-31', created_at: '2026-08-09T22:35:50Z', billing_profile: { name: '5k per month' } }], error: null },
        { data: [], error: null },
      ],
      payment_records: [{ data: [{ id: 'p1', amount: 5000, payment_date: '2015-01-01', reference_number: 'TRX-1', method: 'bank_transfer', notes: null }], error: null }],
      resident_wallets: [{ data: { id: 'w' }, error: null }],
      wallet_transactions: [{ data: [{ id: 'w1', type: 'credit', amount: 5000, description: null, reference_type: 'payment', reference_id: 'p1', created_at: '2015-01-01T00:00:00Z' }], error: null }],
    });

    const result = await getAccountStatement({ residentId: 'r1', fromDate: '2015-01-01', toDate: '2026-10-19' });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ openingBalance: 0, closingBalance: 0, summary: { totalInvoiced: 5000, totalPaid: 5000, totalCredits: 0 } });
    expect(result.data!.transactions.map((t) => [t.type, t.date, t.reference])).toEqual([
      ['invoice', '2015-01-01', 'LEGACY-IBB-1-2015-01'],
      ['payment', '2015-01-01', 'TRX-1'],
    ]);

    const payments = queries.find((q) => q.table === 'payment_records')!;
    expect(args(payments.calls, 'select')[0][0]).toBe('id, amount, payment_date, reference_number, method, notes');

    const [periodQuery, priorQuery] = queries.filter((q) => q.table === 'invoices');
    expect(args(periodQuery.calls, 'gte')).toEqual([]);
    expect(args(periodQuery.calls, 'or')[0][0]).toBe(
      'and(period_start.gte.2015-01-01,period_start.lte.2026-10-19),and(period_start.is.null,created_at.gte.2015-01-01,created_at.lte.2026-10-19)',
    );
    expect(args(priorQuery.calls, 'or')[0][0]).toBe('period_start.lt.2015-01-01,and(period_start.is.null,created_at.lt.2015-01-01)');
  });
});
