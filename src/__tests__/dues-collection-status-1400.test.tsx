// @vitest-environment jsdom
// #1400: Dues, levies and collection status replaces the Indebtedness and Indebtedness Detail reports.
// Its total owed must equal the Indebtedness report's for the same data; a schedule of a retired
// report runs as the new one; the grid view and the server PDF draw it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ getDebtStatuses: vi.fn() }));

vi.mock('@/lib/billing/debt-status', async (orig) => ({
  ...(await orig<typeof import('@/lib/billing/debt-status')>()),
  getDebtStatuses: mocks.getDebtStatuses,
}));
vi.mock('@/hooks/use-reports', () => ({
  useReportVersionHistory: () => ({ data: [], isLoading: false }),
}));

import { generateReportWithClient, generateIndebtednessReport } from '@/lib/reports/report-generator';
import { isSummaryReport, type SummaryReportData } from '@/lib/reports/summary-report';
import {
  hasGenerator,
  isRetiredReport,
  reportRequestSchema,
  resolveRetiredReport,
  runnableReportsForPermissions,
  type ReportRequestFormData,
} from '@/lib/validators/reports';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { DuesMonthGrid } from '@/components/reports/dues-month-grid';
import { PAYMENT_STATUS_META } from '@/components/houses/house-status-maps';

// "Today" is 15 October 2026, so a due date before it is overdue and one after it is not yet due.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
  mocks.getDebtStatuses.mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const money = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rh = (id: string) => [{ resident_id: id, resident_role: 'tenant', is_active: true, resident: { id, first_name: 'Res', last_name: id } }];
const house = (id: string, n: string, street: string, occupied = true) => ({
  id, house_number: n, street: { id: `s-${street}`, name: street }, resident_houses: occupied ? rh(`r${id}`) : [],
});
const HOUSES = [
  house('h1', '1', 'Palm Close'),
  house('h2', '2', 'Palm Close'),
  house('h3', '3', 'Cedar Way'),
  house('h4', '4', 'Cedar Way'),
  house('h5', '5', 'Cedar Way', false),
];

let seq = 0;
const inv = (houseId: string, status: string, due: string, amountDue: number, amountPaid: number, extra: Record<string, unknown> = {}) => ({
  id: `i${String(++seq).padStart(5, '0')}`, house_id: houseId, invoice_number: `INV-${seq}`, status, due_date: due,
  amount_due: amountDue, amount_paid: amountPaid, period_start: null, rate_snapshot: null, charge_category: 'dues', invoice_type: 'SERVICE_CHARGE', ...extra,
});
const dues = (houseId: string, month: string, status: string, due: string, amountDue = 10000, amountPaid = status === 'paid' ? 10000 : 0) =>
  inv(houseId, status, due, amountDue, amountPaid, { period_start: `${month}-01` });
// Due inside the period, so a levy counted as a month would show.
const levy = (houseId: string, status: string, amountDue = 50000, amountPaid = status === 'paid' ? 50000 : 0) =>
  inv(houseId, status, '2026-09-30', amountDue, amountPaid, { rate_snapshot: { is_development_levy: true } });

const INVOICES = [
  // h1 pays everything, levy included.
  dues('h1', '2026-08', 'paid', '2026-08-10'), dues('h1', '2026-09', 'paid', '2026-09-10'), dues('h1', '2026-10', 'paid', '2026-10-10'),
  levy('h1', 'paid'),
  // h2 paid August, owes September (overdue) and October (not yet due), part paid the levy.
  dues('h2', '2026-08', 'paid', '2026-08-10'), dues('h2', '2026-09', 'unpaid', '2026-09-10'), dues('h2', '2026-10', 'unpaid', '2026-10-25'),
  levy('h2', 'partially_paid', 50000, 20000),
  // A void invoice is ignored: h2's September would still read overdue and owed, and h4's void month would read as a bill.
  dues('h2', '2026-09', 'void', '2026-09-20', 99999), dues('h4', '2026-09', 'void', '2026-09-05', 7777),
  // h3 paid no month, also owes July (before the period) and the levy.
  dues('h3', '2026-07', 'unpaid', '2026-07-10', 5000), dues('h3', '2026-08', 'unpaid', '2026-08-10'),
  dues('h3', '2026-09', 'unpaid', '2026-09-10'), dues('h3', '2026-10', 'partially_paid', '2026-10-25', 10000, 4000),
  levy('h3', 'unpaid'),
  // h4 has no invoice at all.
];

function table(rows: Record<string, unknown>[]) {
  let filtered = rows;
  let lo = 0;
  let hi = 999; // like PostgREST, a read with no range returns at most 1000 rows
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'not']) q[m] = () => q;
  // Only the charge columns filter; the houses fixtures carry no is_active.
  q.eq = (col: string, val: unknown) => { if (col === 'charge_category' || col === 'code') filtered = filtered.filter((r) => r[col] === val); return q; };
  q.neq = (col: string, val: unknown) => { filtered = filtered.filter((r) => r[col] !== val); return q; };
  q.in = (col: string, vals: unknown[]) => { filtered = filtered.filter((r) => vals.includes(r[col])); return q; };
  q.range = (a: number, b: number) => { lo = a; hi = b; return q; };
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: filtered.slice(lo, hi + 1), error: null }).then(res);
  return q;
}
const CHARGES = [
  { code: 'dues', name: 'Security Dues', is_active: true },
  { code: 'development_levy', name: 'Development Levy', is_active: true },
  { code: 'transformer_fee', name: 'Transformer Fee', is_active: true },
  { code: 'old_charge', name: 'Old Charge', is_active: false },
];
const clientWith = (invoices: unknown[] = INVOICES, houses: unknown[] = HOUSES) =>
  ({ from: (t: string) => table((t === 'houses' ? houses : t === 'charge_categories' ? CHARGES : invoices) as Record<string, unknown>[]) }) as never;

const PERIOD = { periodPreset: 'custom' as const, startDate: '2026-08-01', endDate: '2026-10-31' };
const params = (over: Partial<ReportRequestFormData> = {}) =>
  ({ ...reportRequestSchema.parse({ reportType: 'dues_collection_status', ...PERIOD }), includeDetails: false, ...over }) as ReportRequestFormData;

async function run(over: Partial<ReportRequestFormData> = {}, invoices: unknown[] = INVOICES, houses: unknown[] = HOUSES): Promise<SummaryReportData> {
  const result = await generateReportWithClient(clientWith(invoices, houses), params(over));
  expect(result.error).toBeUndefined();
  expect(isSummaryReport(result.report)).toBe(true);
  return (result.report as { data: SummaryReportData }).data;
}
const rowFor = (data: SummaryReportData, houseNumber: string) => data.table.rows.find((r) => r.debtor === houseNumber)!;

describe('Dues, levies and collection status (#1400)', () => {
  it('returns the summary layout marker and type, and is generatable', async () => {
    const result = await generateReportWithClient(clientWith(), params());
    expect(result.report).toMatchObject({ type: 'dues_collection_status', layout: 'summary' });
    expect(hasGenerator('dues_collection_status')).toBe(true);
  });

  it('shows the four tiles: fully paid, part paid, not paid, total owed', async () => {
    const data = await run();
    // h1 and h4 owe nothing; h2 owes 20,000 and paid a month; h3 owes 5,000 + 10,000 + 10,000 + 6,000 + 50,000 and paid no month.
    expect(data.summary.map((t) => [t.label, t.value])).toEqual([
      ['Houses fully paid', 2],
      ['Houses part paid', 1],
      ['Houses not paid', 1],
      ['Total owed (NGN)', '131,000.00'],
    ]);
  });

  it('has one row per house with months paid of billed, months owed, levy, owed and status', async () => {
    mocks.getDebtStatuses.mockResolvedValue([{ houseId: 'h3', residentId: null, status: 'arrears', label: 'Owing', owedInvoiceCount: 4, walletBalance: 0 }]);
    const data = await run();
    expect(data.table.columns.map((c) => c.label)).toEqual(['House', 'Street', 'Primary Resident', 'Months paid', 'Months owed', 'Levy', 'Owed', 'Status']);
    expect(data.table.rows.map((r) => r.debtor)).toEqual(['3', '4', '1', '2']); // street, then house number
    expect(rowFor(data, '1')).toMatchObject({ street: 'Palm Close', monthsPaid: '3 of 3', monthsOwed: 0, levy: 'Paid', owed: '0.00' });
    expect(rowFor(data, '2')).toMatchObject({ monthsPaid: '1 of 3', monthsOwed: 2, levy: 'Part paid', owed: '50,000.00' });
    expect(rowFor(data, '3')).toMatchObject({ street: 'Cedar Way', monthsPaid: '0 of 3', monthsOwed: 3, levy: 'Not paid', owed: '81,000.00', status: 'Owing' });
    expect(rowFor(data, '4')).toMatchObject({ monthsPaid: '0 of 0', monthsOwed: 0, levy: 'No levy', owed: '0.00' });
    expect(data.table.totals).toMatchObject({ debtor: 'Total', monthsOwed: 5, owed: '131,000.00' });
  });

  it('total owed equals the Indebtedness report for the same data, house by house', async () => {
    for (const includeUnoccupied of [false, true]) {
      const old = await generateIndebtednessReport(clientWith(), includeUnoccupied, true);
      const data = await run({ includeUnoccupied });
      const tile = data.summary[3].value as string;
      expect(Number(tile.replace(/,/g, '')), String(includeUnoccupied)).toBe(old.summary.totalOutstanding);
      expect(data.table.totals!.owed).toBe(money(old.summary.totalOutstanding!));
      expect(data.table.rows.map((r) => [r.debtor, r.owed])).toEqual(old.houses.map((h) => [h.houseNumber, money(Math.max(0, h.outstandingAmount ?? 0))]));
      expect(data.table.rows).toHaveLength(old.houses.length);
    }
  });

  it('leaves out unoccupied houses unless asked, like the Indebtedness report', async () => {
    expect((await run()).table.rows.map((r) => r.debtor)).not.toContain('5');
    expect((await run({ includeUnoccupied: true })).table.rows.map((r) => r.debtor)).toContain('5');
  });

  it('a house in credit owes nothing and the total ignores it, as in the Indebtedness report', async () => {
    const credit = [dues('h1', '2026-08', 'unpaid', '2026-08-10', 1000, 4000), ...INVOICES.filter((i) => i.house_id !== 'h1')];
    const old = await generateIndebtednessReport(clientWith(credit), false, true);
    const data = await run({}, credit);
    expect(rowFor(data, '1').owed).toBe('0.00');
    expect(data.table.totals!.owed).toBe(money(old.summary.totalOutstanding!));
  });

  it('draws the chart as owed by street, biggest first', async () => {
    const data = await run();
    expect(data.chart!.title).toBe('Owed by street (NGN)');
    expect(data.chart!.bars.map((b) => [b.label, b.value])).toEqual([['Cedar Way', 81000], ['Palm Close', 50000]]);
  });

  it('levy status: Paid, Part paid, Not paid, No levy', async () => {
    const data = await run();
    expect(data.table.rows.map((r) => [r.debtor, r.levy])).toEqual([['3', 'Not paid'], ['4', 'No levy'], ['1', 'Paid'], ['2', 'Part paid']]);
    // A levy that is half paid on one invoice and untouched on another is also part paid.
    const mixed = [levy('h4', 'paid'), levy('h4', 'unpaid')];
    expect(rowFor(await run({}, mixed), '4').levy).toBe('Part paid');
    // A levy invoice never counts as a month.
    expect(rowFor(await run({}, [levy('h4', 'unpaid')]), '4')).toMatchObject({ levy: 'Not paid', monthsPaid: '0 of 0', monthsOwed: 0 });
  });

  it('counts only the chosen charge: other charges add nothing to the months, Owed or lines', async () => {
    const other = [
      dues('h4', '2026-08', 'paid', '2026-08-10'),
      inv('h4', 'unpaid', '2026-08-20', 3000, 0, { charge_category: 'transformer_fee', period_start: '2026-08-01' }), // would turn August overdue
      inv('h4', 'unpaid', '2026-09-10', 2000, 0, { charge_category: 'development_levy', period_start: '2026-09-01' }), // would make September a billed month
    ];
    const data = await run({ includeDetails: true }, other);
    expect(rowFor(data, '4')).toMatchObject({ monthsPaid: '1 of 1', monthsOwed: 0, owed: '0.00', levy: 'Not paid' });
    expect(data.grid!.houses.find((h) => h.houseNumber === '4')!.months).toEqual({ '2026-08': 'paid_up', '2026-09': 'no_invoice', '2026-10': 'no_invoice' });
    expect(data.table.totals!.owed).toBe('0.00');
    expect(data.table.rows.filter((r) => r.street === null)).toEqual([]);
    expect(data.chargeName).toBe('Security Dues');
  });

  it('under Security Dues only service charges are months: levy, adjustment and other types add to Owed, not to the months', async () => {
    const other = [
      dues('h4', '2026-08', 'paid', '2026-08-10'),
      inv('h4', 'unpaid', '2026-08-20', 3000, 0, { invoice_type: 'LEVY', period_start: '2026-08-01' }), // would turn August overdue
      inv('h4', 'unpaid', '2026-09-10', 2000, 0, { invoice_type: 'ADJUSTMENT', period_start: '2026-09-01' }), // would make September a billed month
      inv('h4', 'unpaid', '2026-10-10', 1000, 0, { invoice_type: 'OTHER', period_start: '2026-10-01' }),
    ];
    const data = await run({}, other);
    expect(rowFor(data, '4')).toMatchObject({ monthsPaid: '1 of 1', monthsOwed: 0, owed: '6,000.00' });
    expect(data.grid!.houses.find((h) => h.houseNumber === '4')!.months).toEqual({ '2026-08': 'paid_up', '2026-09': 'no_invoice', '2026-10': 'no_invoice' });
  });

  it('under the Development Levy charge a levy-flagged invoice is the charge, so it is a month', async () => {
    const levyBill = [
      inv('h4', 'unpaid', '2026-09-10', 4000, 0, { charge_category: 'development_levy', invoice_type: 'LEVY', period_start: '2026-09-01', rate_snapshot: { is_development_levy: true } }),
    ];
    const data = await run({ chargeCategory: 'development_levy' }, levyBill);
    expect(rowFor(data, '4')).toMatchObject({ monthsPaid: '0 of 1', monthsOwed: 1, owed: '4,000.00', levy: 'Not paid' });
    expect(data.grid!.houses.find((h) => h.houseNumber === '4')!.months['2026-09']).toBe('overdue');
  });

  it('refuses a charge that is not active, with a clear message', async () => {
    const result = await generateReportWithClient(clientWith(), params({ chargeCategory: 'old_charge' }));
    expect(result).toEqual({ success: false, error: 'Old Charge is not an active charge, so it cannot be reported.' });
  });

  it('another charge shows its own invoices, Owed and lines, named in chargeName', async () => {
    const other = [
      dues('h4', '2026-08', 'paid', '2026-08-10'),
      inv('h4', 'unpaid', '2026-08-20', 3000, 0, { charge_category: 'transformer_fee', period_start: '2026-08-01' }),
      inv('h4', 'paid', '2026-09-10', 2000, 2000, { charge_category: 'transformer_fee', period_start: '2026-09-01' }),
    ];
    const data = await run({ includeDetails: true, chargeCategory: 'transformer_fee' }, other);
    expect(data.chargeName).toBe('Transformer Fee');
    expect(rowFor(data, '4')).toMatchObject({ monthsPaid: '1 of 2', monthsOwed: 1, owed: '3,000.00' });
    expect(data.table.rows.filter((r) => r.street === null)).toHaveLength(1);
    expect(data.table.totals!.owed).toBe('3,000.00');
    expect(data.notes!.join(' ')).toContain('Charge: Transformer Fee');
  });

  it('asks the debt status for the chosen charge only, and for every charge when none is chosen elsewhere', async () => {
    mocks.getDebtStatuses.mockClear();
    await run({ chargeCategory: 'development_levy' });
    expect(mocks.getDebtStatuses.mock.calls[0][1]).toMatchObject({ chargeCategory: 'development_levy' });
    mocks.getDebtStatuses.mockClear();
    await generateIndebtednessReport(clientWith(), false, true);
    expect(mocks.getDebtStatuses.mock.calls[0][1].chargeCategory).toBeUndefined();
  });

  it('an unknown charge fails the report with a clear message', async () => {
    const result = await generateReportWithClient(clientWith(), params({ chargeCategory: 'nope' }));
    expect(result).toEqual({ success: false, error: 'Unknown charge: nope' });
  });

  it('the Primary Resident is the tenant for dues and the landlord for levy and fee', async () => {
    const links = [
      { resident_id: 'ten', resident_role: 'tenant', is_active: true, move_in_date: '2025-01-01', resident: { id: 'ten', first_name: 'Ten', last_name: 'Ant' } },
      { resident_id: 'nrl', resident_role: 'non_resident_landlord', is_active: true, move_in_date: '2020-01-01', resident: { id: 'nrl', first_name: 'Land', last_name: 'Lord' } },
    ];
    const houses = [{ id: 'h9', house_number: '9', street: { id: 's', name: 'Palm Close' }, resident_houses: links }];
    for (const [charge, name] of [['dues', 'Ten Ant'], ['development_levy', 'Land Lord'], ['transformer_fee', 'Land Lord']] as const) {
      const data = await run({ chargeCategory: charge }, [], houses);
      expect(rowFor(data, '9').resident, charge).toBe(name);
    }
    // A dues house whose billing profile says the landlord pays shows the landlord.
    const landlordPays = [{ ...houses[0], billing_profile: { payer: 'landlord' } }];
    expect(rowFor(await run({ chargeCategory: 'dues' }, [], landlordPays), '9').resident).toBe('Land Lord');
    // A landlord charge ignores an occupant profile.
    const occupantPays = [{ ...houses[0], billing_profile: { payer: 'occupant' } }];
    expect(rowFor(await run({ chargeCategory: 'transformer_fee' }, [], occupantPays), '9').resident).toBe('Land Lord');
  });

  it('a void invoice is no bill: a month with only a void invoice has no invoice', async () => {
    const data = await run();
    expect(data.grid!.houses.find((h) => h.houseNumber === '4')!.months['2026-09']).toBe('no_invoice');
    expect(data.grid!.houses.find((h) => h.houseNumber === '2')!.months['2026-09']).toBe('overdue');
    expect(rowFor(data, '2').owed).toBe('50,000.00');
  });

  it('an invoice due today is outstanding, not overdue; due yesterday is overdue', async () => {
    const edge = [dues('h4', '2026-10', 'unpaid', '2026-10-15'), dues('h3', '2026-10', 'unpaid', '2026-10-14')];
    const grid = (await run({}, edge)).grid!;
    expect(grid.houses.find((h) => h.houseNumber === '4')!.months['2026-10']).toBe('outstanding');
    expect(grid.houses.find((h) => h.houseNumber === '3')!.months['2026-10']).toBe('overdue');
  });

  it('invoice lines leave out an open invoice with nothing outstanding', async () => {
    const zero = [inv('h4', 'unpaid', '2026-09-10', 5000, 5000, { period_start: '2026-09-01' }), dues('h4', '2026-10', 'unpaid', '2026-10-25')];
    const on = await run({ includeDetails: true }, zero);
    const lines = on.table.rows.filter((r) => r.street === null);
    expect(lines).toHaveLength(1);
    expect(lines[0].owed).toBe('10,000.00');
  });

  it('sorts a house into fully paid, part paid or not paid by what it owes and the months it paid', async () => {
    const houses = [house('h6', '6', 'Palm Close'), house('h7', '7', 'Palm Close'), house('h8', '8', 'Palm Close')];
    const invoices = [
      dues('h6', '2026-08', 'paid', '2026-08-10'), dues('h6', '2026-09', 'paid', '2026-09-10'), dues('h6', '2026-10', 'unpaid', '2026-10-25'),
      dues('h7', '2026-08', 'unpaid', '2026-08-10'), dues('h8', '2026-09', 'unpaid', '2026-09-10'),
    ];
    const data = await run({}, invoices, houses);
    expect(data.summary.slice(0, 3).map((t) => [t.label, t.value])).toEqual([['Houses fully paid', 0], ['Houses part paid', 1], ['Houses not paid', 2]]);
  });

  it('adds one invoice line under each house only when invoice lines are on', async () => {
    const off = await run({ includeDetails: false });
    const on = await run({ includeDetails: true });
    // Unpaid or part paid invoices: h2 has 3 (two months and the levy), h3 has 5 (July, Aug, Sep, Oct and the levy).
    expect(off.table.rows).toHaveLength(4);
    expect(on.table.rows).toHaveLength(4 + 3 + 5);
    const lines = on.table.rows.filter((r) => r.street === null);
    expect(lines[0].debtor).toMatch(/^ {4}INV-\d+, due 10 July 2026, unpaid$/);
    expect(lines.some((l) => /due 25 October 2026, part paid$/.test(String(l.debtor)))).toBe(true);
    // The lines of a house add up to what it owes; the totals and tiles do not change.
    const h3Lines = on.table.rows.slice(on.table.rows.findIndex((r) => r.debtor === '3') + 1).filter((r) => r.street === null);
    expect(h3Lines.slice(0, 5).reduce((sum, l) => sum + Number(String(l.owed).replace(/,/g, '')), 0)).toBe(81000);
    expect(on.table.totals).toEqual(off.table.totals);
    expect(on.summary).toEqual(off.summary);
  });

  it('counts a month by its period start, or its due date when it has none, with the period ends included', async () => {
    const edge = [
      dues('h4', '2026-07', 'paid', '2026-07-31'),            // the month before the period: not counted
      inv('h4', 'paid', '2026-09-05', 10000, 10000, { period_start: '2026-08-01' }), // first day of the period; due a month later
      inv('h4', 'unpaid', '2026-10-31', 10000, 0, { period_start: '2026-10-31' }),   // last day of the period
      inv('h4', 'paid', '2026-11-01', 10000, 10000, { period_start: '2026-11-01' }), // the month after: not counted
      inv('h4', 'paid', '2026-09-30', 10000, 10000),          // no period start: by due date, September
    ];
    const data = await run({}, edge);
    expect(rowFor(data, '4')).toMatchObject({ monthsPaid: '2 of 3', monthsOwed: 1 });
    // The report is as of one day: no period is printed in the notes (#1400).
    expect(data.notes!.join(' ')).not.toMatch(/Aug 2026 to|Oct 2026/);
  });

  it('a one-month period has one month, and an empty custom range falls back to this year so far', async () => {
    const one = await run({ startDate: '2026-09-15', endDate: '2026-09-15' });
    expect(one.grid!.months.map((m) => m.label)).toEqual(['Sep 2026']);
    expect(rowFor(one, '2').monthsOwed).toBe(1);
    const fallback = await run({ startDate: '', endDate: '' });
    expect(fallback.grid!.months.map((m) => m.label)).toEqual(['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026']);
  });

  it('shows at most the latest 24 months and says so', async () => {
    const data = await run({ startDate: '2020-01-01', endDate: '2026-10-31' });
    expect(data.grid!.months).toHaveLength(24);
    expect(data.grid!.months[0].label).toBe('Nov 2024');
    expect(data.notes!.join(' ')).toContain('latest 24 are shown');
  });

  it('reads past 1000 invoices a page at a time', async () => {
    const many = Array.from({ length: 1500 }, () => inv('h4', 'unpaid', '2026-09-10', 10, 0, { period_start: '2026-09-01' }));
    // The last row sits past the first 1000: a month read that is not paged would miss it.
    many.push(dues('h4', '2026-10', 'paid', '2026-10-10'));
    const data = await run({}, many);
    expect(rowFor(data, '4')).toMatchObject({ owed: '15,000.00', monthsPaid: '1 of 2' });
    // The Indebtedness generator it reuses is paged too, so the total is the full 15,000 and not the first 1,000 rows.
    const old = await generateIndebtednessReport(clientWith(many), false, true);
    expect(old.summary.totalOutstanding).toBe(15000);
    expect(data.summary[3].value).toBe('15,000.00');
  });

  it('reads cleanly with no houses', async () => {
    const data = await run({}, [], []);
    expect(data.summary.map((t) => t.value)).toEqual([0, 0, 0, '0.00']);
    expect(data.table.rows).toEqual([]);
    expect(data.grid!.houses).toEqual([]);
  });

  it('a database error fails the report with its message', async () => {
    const failing = { from: () => { const q = table([]); q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(res); return q; } } as never;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await generateReportWithClient(failing, params());
    spy.mockRestore();
    expect(result).toEqual({ success: false, error: 'boom' });
  });
});

describe('Grid data (#1400)', () => {
  it('gives each house a status per month in the estate map words', async () => {
    const { grid } = await run();
    expect(grid!.months).toEqual([
      { key: '2026-08', label: 'Aug 2026' }, { key: '2026-09', label: 'Sep 2026' }, { key: '2026-10', label: 'Oct 2026' },
    ]);
    const byNumber = Object.fromEntries(grid!.houses.map((h) => [h.houseNumber, h]));
    expect(byNumber['1'].months).toEqual({ '2026-08': 'paid_up', '2026-09': 'paid_up', '2026-10': 'paid_up' });
    expect(byNumber['2'].months).toEqual({ '2026-08': 'paid_up', '2026-09': 'overdue', '2026-10': 'outstanding' });
    expect(byNumber['3'].months).toEqual({ '2026-08': 'overdue', '2026-09': 'overdue', '2026-10': 'outstanding' });
    expect(byNumber['4'].months).toEqual({ '2026-08': 'no_invoice', '2026-09': 'no_invoice', '2026-10': 'no_invoice' });
    expect(byNumber['3']).toMatchObject({ levy: 'Not paid', owed: 81000, streetName: 'Cedar Way' });
    for (const status of Object.values(byNumber).flatMap((h) => Object.values(h.months))) expect(PAYMENT_STATUS_META[status]).toBeDefined();
  });

  it('other summary reports have no grid', async () => {
    const result = await generateReportWithClient(
      { from: () => table([]) } as never,
      reportRequestSchema.parse({ reportType: 'debtors_aging', periodPreset: 'this_month' }) as ReportRequestFormData
    );
    expect((result.report as { data: SummaryReportData }).data.grid).toBeUndefined();
  });
});

describe('DuesMonthGrid (#1400)', () => {
  it('draws a coloured, labelled cell for every house and month, plus levy and owed', async () => {
    const { grid } = await run();
    render(<DuesMonthGrid grid={grid!} />);
    const root = screen.getByTestId('dues-month-grid');
    for (const month of ['Aug 2026', 'Sep 2026', 'Oct 2026']) expect(within(root).getByText(month)).toBeTruthy();
    const cells = within(root).getAllByTestId('dues-grid-cell');
    expect(cells).toHaveLength(4 * 3);
    const statusOf = (rowIndex: number) => cells.slice(rowIndex * 3, rowIndex * 3 + 3).map((c) => c.getAttribute('data-status'));
    expect(statusOf(2)).toEqual(['paid_up', 'paid_up', 'paid_up']); // house 1
    expect(statusOf(3)).toEqual(['paid_up', 'overdue', 'outstanding']); // house 2
    // Text carries the status too, in the shared words, so colour is not the only cue.
    expect(cells[10].textContent).toBe(PAYMENT_STATUS_META.overdue.label);
    expect(cells[11].textContent).toBe(PAYMENT_STATUS_META.outstanding.label);
    expect(cells[0].className).toContain('border-2'); // the shared "flagged" style of an exception
    expect(cells[6].className).toContain('bg-muted'); // paid up is the plain cell
    expect(within(root).getByText('Not paid')).toBeTruthy();
    expect(within(root).getByText('Part paid')).toBeTruthy();
    expect(within(root).getByText('81,000.00')).toBeTruthy();
    // The legend uses the shared labels.
    for (const status of ['overdue', 'outstanding', 'paid_up', 'no_invoice'] as const) {
      expect(within(root).getAllByText(PAYMENT_STATUS_META[status].label).length).toBeGreaterThan(0);
    }
  });

  it('says so when there are no houses', () => {
    render(<DuesMonthGrid grid={{ months: [], houses: [] }} />);
    expect(screen.getByText('No houses for this report.')).toBeTruthy();
  });
});

describe('Report viewer grid toggle (#1400)', () => {
  async function viewer(data: unknown) {
    const { ReportViewer } = await import('@/components/reports/report-viewer');
    const report = { id: 'r1', type: 'dues_collection_status', title: 'Dues', data, generatedAt: new Date().toISOString(), parameters: params(), parentReportId: null } as never;
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><ReportViewer report={report} /></QueryClientProvider>);
  }

  it('offers Sheet and Grid of months, and switches between them', async () => {
    const result = await generateReportWithClient(clientWith(), params());
    await viewer(result.report);
    expect(screen.getByTestId('summary-report').closest('.hidden')).toBeNull();
    expect(screen.queryByTestId('dues-month-grid')).toBeNull();
    fireEvent.mouseDown(screen.getByTestId('report-view-grid'));
    fireEvent.click(screen.getByTestId('report-view-grid'));
    expect(screen.getByTestId('dues-month-grid')).toBeTruthy();
    // The sheet stays mounted but hidden, so Export PDF still prints it.
    expect(screen.getByTestId('summary-report').closest('.hidden')).not.toBeNull();
  });

  it('has no toggle for a summary report without a grid', async () => {
    const data: SummaryReportData = { summary: [], table: { columns: [{ key: 'a', label: 'A' }], rows: [] } };
    await viewer({ type: 'debtors_aging', layout: 'summary', data });
    expect(screen.queryByTestId('report-view-grid')).toBeNull();
  });
});

describe('Server PDF (#1400)', () => {
  it('renders a PDF with and without invoice lines', async () => {
    const { renderReportPdf } = await import('@/lib/pdf/reports/renderer');
    for (const includeDetails of [false, true]) {
      const data = await run({ includeDetails });
      const buffer = await renderReportPdf('dues_collection_status', data, 'Test Estate');
      expect(buffer, String(includeDetails)).not.toBeNull();
      expect(buffer!.subarray(0, 4).toString()).toBe('%PDF');
    }
  });

  it('draws the tiles, bars and table text, with the title from the report list', async () => {
    const { SummaryReportPdf } = await import('@/lib/pdf/reports/summary-report-pdf');
    const data = await run();
    const tree = JSON.stringify(SummaryReportPdf({ data, title: 'Dues, levies and collection status', estateName: 'Test Estate' }));
    for (const text of ['Houses fully paid', '131,000.00', 'Owed by street (NGN)', 'Cedar Way', '0 of 3', 'Part paid', 'Total']) {
      expect(tree, text).toContain(text);
    }
  });

  it('the CSV export carries the table', async () => {
    const { summaryTableToCsv } = await import('@/lib/reports/summary-report');
    const csv = summaryTableToCsv((await run()).table);
    expect(csv.split('\n')[0]).toBe('House,Street,Primary Resident,Months paid,Months owed,Levy,Owed,Status');
    expect(csv).toContain('3,Cedar Way,Res rh3,0 of 3,3,Not paid,"81,000.00",');
  });

  it('renderToStaticMarkup of the layout shows the tiles', async () => {
    const { SummaryReportLayout } = await import('@/components/reports/summary-report-layout');
    const html = renderToStaticMarkup(<SummaryReportLayout data={await run()} variant="modern" />);
    expect(html).toContain('Houses not paid');
    expect(html).toContain('131,000.00');
  });
});

describe('Retiring the Indebtedness reports (#1400)', () => {
  it.each(['indebtedness_summary', 'indebtedness_detail'] as const)('%s is retired, replaced by the new report, and has no generator', (type) => {
    expect(isRetiredReport(type)).toBe(true);
    expect(resolveRetiredReport(type)).toBe('dues_collection_status');
    expect(hasGenerator(type)).toBe(false);
  });

  it('are hidden from the picker and the schedule list, and the new report is offered', () => {
    const runnable = runnableReportsForPermissions([PERMISSIONS.REPORTS_VIEW_FINANCIAL]);
    expect(runnable).toContain('dues_collection_status');
    expect(runnable).not.toContain('indebtedness_summary');
    expect(runnable).not.toContain('indebtedness_detail');
  });

  it('are refused with a pointer to the new report', async () => {
    const result = await generateReportWithClient(clientWith(), params({ reportType: 'indebtedness_summary' }));
    expect(result).toEqual({ success: false, error: 'Indebtedness Report was replaced by Dues, levies and collection status.' });
  });

  it.each(['indebtedness_summary', 'indebtedness_detail'])('a %s schedule runs as the new report, with invoice lines off', async (savedType) => {
    vi.resetModules();
    const generate = vi.fn().mockResolvedValue({ success: true, report: { type: 'dues_collection_status', layout: 'summary', data: {} } });
    const render = vi.fn().mockResolvedValue(null);
    const schedule = { id: 's1', report_type: savedType, period_preset: 'last_month', frequency: 'monthly', bank_account_ids: [], recipients: [], configuration: { includeUnoccupied: true } };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'lte']) chain[method] = () => chain;
    chain.order = async () => ({ data: [schedule], error: null });
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: () => chain }) }));
    vi.doMock('@/lib/reports/report-generator', () => ({ generateReportWithClient: generate }));
    vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: render }));
    vi.doMock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(), getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    const { processDueSchedules } = await import('@/lib/reports/process-schedules');
    await processDueSchedules();
    expect(generate.mock.calls[0][1]).toMatchObject({ reportType: 'dues_collection_status', includeUnoccupied: true, includeDetails: false });
    expect(render.mock.calls[0][0]).toBe('dues_collection_status');
    for (const m of ['@/lib/supabase/server', '@/lib/reports/report-generator', '@/lib/pdf/reports/renderer', '@/lib/email/send-email', '@/lib/audit/logger']) vi.doUnmock(m);
  });

  it.each([[true, true], [false, false]])('a dues schedule with include_summary %s runs with invoice lines %s', async (saved, expected) => {
    vi.resetModules();
    const generate = vi.fn().mockResolvedValue({ success: true, report: { type: 'dues_collection_status', layout: 'summary', data: {} } });
    const schedule = { id: 's1', report_type: 'dues_collection_status', include_summary: saved, period_preset: 'last_month', frequency: 'monthly', bank_account_ids: [], recipients: [], configuration: {} };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'lte']) chain[method] = () => chain;
    chain.order = async () => ({ data: [schedule], error: null });
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: () => chain }) }));
    vi.doMock('@/lib/reports/report-generator', () => ({ generateReportWithClient: generate }));
    vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: vi.fn().mockResolvedValue(null) }));
    vi.doMock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(), getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    const { processDueSchedules } = await import('@/lib/reports/process-schedules');
    await processDueSchedules();
    expect(generate.mock.calls[0][1].includeDetails).toBe(expected);
    for (const m of ['@/lib/supabase/server', '@/lib/reports/report-generator', '@/lib/pdf/reports/renderer', '@/lib/email/send-email', '@/lib/audit/logger']) vi.doUnmock(m);
  });

  it('old History rows still open with the old renderer', async () => {
    const { TraditionalTemplate } = await import('@/components/reports/templates/traditional-template');
    const old = await generateIndebtednessReport(clientWith(), false, true);
    const html = renderToStaticMarkup(
      <TraditionalTemplate report={{ type: 'indebtedness_summary', data: old } as never} title="Indebtedness Report" estateName="Test Estate" />
    );
    expect(html).toContain('Palm Close');
  });
});

describe('Invoice lines are off by default for the dues report (#1400)', () => {
  it('the schedule dialog saves include_summary false for dues and debtors, true for others', async () => {
    const { includeSummaryDefault } = await import('@/components/reports/report-schedules');
    expect(includeSummaryDefault('dues_collection_status')).toBe(false);
    expect(includeSummaryDefault('debtors_aging')).toBe(false);
    expect(includeSummaryDefault('financial_overview')).toBe(true);
  });

  it.each([
    ['dues_collection_status', '', false],
    ['dues_collection_status', '&includeDetails=true', true],
    ['indebtedness_summary', '', false], // a retired type is made again as the dues report
    ['transaction_log', '', true],
  ])('the download route for %s%s passes includeDetails %s', async (type, query, expected) => {
    vi.resetModules();
    const generateReport = vi.fn().mockResolvedValue({ success: false, error: 'stop' });
    vi.doMock('@/actions/reports/report-engine', () => ({ generateReport }));
    vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: vi.fn() }));
    vi.doMock('@/lib/pdf/reports/archive', () => ({ storeReportPdf: vi.fn() }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    vi.doMock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true, userId: 'u1' }) }));
    vi.doMock('@/lib/email/send-email', () => ({ getEstateEmailSettings: async () => ({ estateName: 'Test Estate' }) }));
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }));
    const { GET } = await import('@/app/api/reports/download/route');
    const { NextRequest } = await import('next/server');
    await GET(new NextRequest(`http://localhost/api/reports/download?type=${type}${query}`));
    expect(generateReport.mock.calls[0][0]).toMatchObject({ reportType: type === 'indebtedness_summary' ? 'dues_collection_status' : type, includeDetails: expected });
    for (const m of ['@/actions/reports/report-engine', '@/lib/pdf/reports/renderer', '@/lib/pdf/reports/archive', '@/lib/audit/logger', '@/lib/auth/authorize', '@/lib/email/send-email', '@/lib/supabase/server']) vi.doUnmock(m);
  });
});
