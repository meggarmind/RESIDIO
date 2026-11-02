// #1419: report reads must page past the API's 1,000-row cap. Each test serves more than 1,000 rows
// for ONE read and checks that the report counts all of them.
import { describe, expect, it } from 'vitest';

import { generateReportWithClient } from '@/lib/reports/report-generator';
import { reportRequestSchema, type ReportRequestFormData } from '@/lib/validators/reports';

const API_ROW_CAP = 1000;
const TOTAL = 2030;

type Tables = Record<string, unknown[]>;

// Like the API: a read with no range returns at most 1,000 rows; `.range(a, b)` returns that slice
// (still capped at 1,000). Filters are ignored, so each table holds only rows that pass them.
function clientWith(tables: Tables) {
  const from = (table: string) => {
    const rows = tables[table] ?? [];
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ['select', 'eq', 'neq', 'gte', 'lte', 'in', 'order']) builder[method] = chain;
    builder.single = () => Promise.resolve({ data: (rows[0] as unknown) ?? null, error: null });
    builder.range = (a: number, b: number) =>
      Promise.resolve({ data: rows.slice(a, Math.min(b + 1, a + API_ROW_CAP)), error: null });
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows.slice(0, API_ROW_CAP), error: null }).then(resolve, reject);
    return builder;
  };
  return { from } as never;
}

const params = (over: Partial<ReportRequestFormData>) =>
  ({ ...reportRequestSchema.parse({ reportType: over.reportType, periodPreset: 'this_month' }), ...over }) as ReportRequestFormData;

async function run(tables: Tables, over: Partial<ReportRequestFormData>) {
  const result = await generateReportWithClient(clientWith(tables), params(over));
  expect(result.success).toBe(true);
  return (result as unknown as { report: { data: Record<string, any> } }).report.data; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const range = (count: number) => Array.from({ length: count }, (_, i) => i);
const bankRow = (i: number) => ({
  id: `row-${i}`, amount: 10, transaction_type: 'credit', transaction_date: '2026-11-01', tag_id: null,
  description: `Row ${i}`, reference: null, transaction_tags: null,
  bank_statement_imports: { id: 'imp', bank_account_id: 'acc', status: 'completed', estate_bank_accounts: null },
});
const invoice = (i: number) => ({
  id: `inv-${i}`, invoice_number: `INV-${i}`, amount_due: 100, amount_paid: 40, status: 'unpaid', due_date: '2026-11-01',
  resident: { id: 'r1', first_name: 'Ada', last_name: 'Test', resident_code: 'R-1' },
  house: { house_number: '1', street: { name: 'Palm Close' } },
});

describe('report reads page past the 1,000-row cap (#1419)', () => {
  it('financial overview counts every bank row', async () => {
    const data = await run({ bank_statement_rows: range(TOTAL).map(bankRow) }, { reportType: 'financial_overview', transactionType: 'credit' });
    expect(data.summary.transactionCount).toBe(TOTAL);
    expect(data.summary.totalCredits).toBe(TOTAL * 10);
  });

  it('financial overview counts every expense', async () => {
    const expenses = range(TOTAL).map((i) => ({
      id: `exp-${i}`, amount: 5, expense_date: '2026-11-01', description: 'x', category_id: null, expense_categories: null,
      payment_method: 'cash', source_type: 'petty_cash', status: 'paid',
    }));
    const data = await run({ expenses }, { reportType: 'financial_overview', transactionType: 'debit' });
    expect(data.summary.transactionCount).toBe(TOTAL);
    expect(data.summary.totalDebits).toBe(TOTAL * 5);
  });

  it('collection report totals every invoice', async () => {
    const data = await run({ invoices: range(TOTAL).map(invoice) }, { reportType: 'collection_report' });
    expect(data.summary.totalInvoiced).toBe(TOTAL * 100);
    expect(data.summary.totalCollected).toBe(TOTAL * 40);
  });

  it('transaction log lists every bank row', async () => {
    const data = await run({ bank_statement_rows: range(TOTAL).map(bankRow) }, { reportType: 'transaction_log', transactionType: 'all' });
    expect(data.summary.totalTransactions).toBe(TOTAL);
    expect(data.transactions).toHaveLength(TOTAL);
  });

  const levySettings = {
    system_settings: [{ value: 'profile-1' }],
    billing_profiles: [{ id: 'profile-1', name: 'Levy', billing_items: [{ amount: 100 }] }],
  };
  const levyHouse = (i: number) => ({
    id: `h-${i}`, house_number: `${i}`, street: { id: 's1', name: 'Palm Close' },
    resident_houses: [{ resident_id: 'r1', resident_role: 'developer', is_active: true, resident: { id: 'r1', first_name: 'Ada', last_name: 'Test' } }],
  });
  const levyInvoice = (house: number, i: number) => ({
    id: `inv-${i}`, house_id: `h-${house}`, amount_due: 100, amount_paid: 100, status: 'paid', rate_snapshot: { is_development_levy: true },
  });

  it('development levy lists every house', async () => {
    const data = await run({ ...levySettings, houses: range(TOTAL).map(levyHouse), invoices: [] }, { reportType: 'development_levy', includeUnoccupied: true });
    expect(data.summary.totalHouses).toBe(TOTAL);
    expect(data.houses).toHaveLength(TOTAL);
  });

  it('development levy reads every invoice, so a payer past row 1,000 shows as paid', async () => {
    // The first 1,000 invoices are all for house 0; houses 1 to 5 are paid by invoices past the cap.
    const invoices = range(TOTAL).map((i) => levyInvoice(i < API_ROW_CAP ? 0 : (i % 5) + 1, i));
    const data = await run({ ...levySettings, houses: range(10).map(levyHouse), invoices }, { reportType: 'development_levy', includeUnoccupied: true });
    expect(data.summary.paidCount).toBe(6);
    expect(data.summary.collectedAmount).toBe(600);
  });
});
