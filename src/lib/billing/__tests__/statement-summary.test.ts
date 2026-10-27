import { describe, expect, it } from 'vitest';
import { buildStatementLedger, type LedgerInvoice, type LedgerPayment } from '@/lib/billing/statement-ledger';

const monthly = (name: string, year: number, month: number, amount: number, id = `${name}-${year}-${month}`): LedgerInvoice => ({
  id,
  invoice_number: `INV-${id}`,
  amount_due: amount,
  status: 'unpaid',
  invoice_type: 'SERVICE_CHARGE',
  period_start: `${year}-${String(month).padStart(2, '0')}-01`,
  period_end: null,
  created_at: '2026-10-01T00:00:00Z',
  charge_name: name,
});

const payment = (id: string, date: string, amount: number): LedgerPayment => ({
  id, amount, payment_date: date, reference_number: id, method: 'bank_transfer', notes: null,
});

// The KOA-18A sample statement: Nov 2025 to Oct 2026 at 10k, paid 50k in Feb and 90k in Oct.
const sample = () => ({
  openingBalance: 0,
  invoices: [
    monthly('Dues', 2025, 11, 10_000),
    monthly('Dues', 2025, 12, 10_000),
    ...Array.from({ length: 10 }, (_, i) => monthly('Dues', 2026, i + 1, 10_000)),
  ],
  payments: [payment('p1', '2026-02-01', 50_000), payment('p2', '2026-10-01', 90_000)],
  walletTransactions: [],
});

const rows = (result: ReturnType<typeof buildStatementLedger>) =>
  result.transactions.map((t) => [t.description, t.debit, t.credit, t.balance]);

describe('buildStatementLedger summary mode (#1234)', () => {
  it('merges each run of unpaid invoices and keeps a lone credit-paid invoice on its own line', () => {
    const summary = buildStatementLedger({ ...sample(), mode: 'summary' });
    expect(rows(summary)).toEqual([
      ['Dues · Nov 2025 – Feb 2026 · 4 invoices', 40_000, 0, 40_000],
      ['Payment (bank_transfer)', 0, 50_000, -10_000],
      ['Invoice #INV-Dues-2026-3 - Dues, MAR 2026', 10_000, 0, 0],
      ['Dues · Apr – Oct 2026 · 7 invoices', 70_000, 0, 70_000],
      ['Payment (bank_transfer)', 0, 90_000, -20_000],
    ]);
    const first = summary.transactions[0];
    expect(first.date).toBe('2025-11-01');
    expect(first.reference).toBe('INV-Dues-2025-11 – INV-Dues-2026-2');
    expect(first.invoice_count).toBe(4);
    expect(first.invoice_id).toBeUndefined();
  });

  it('keeps an invoice that credit pays only partly on its own line, then starts a run', () => {
    const summary = buildStatementLedger({
      openingBalance: -5_000,
      invoices: [monthly('Dues', 2026, 1, 10_000), monthly('Dues', 2026, 2, 10_000), monthly('Dues', 2026, 3, 10_000)],
      payments: [], walletTransactions: [], mode: 'summary',
    });
    expect(rows(summary)).toEqual([
      ['Invoice #INV-Dues-2026-1 - Dues, JAN 2026', 10_000, 0, 5_000],
      ['Dues · Feb – Mar 2026 · 2 invoices', 20_000, 0, 25_000],
    ]);
  });

  it('merges a run that a credit balance pays in full (#1253)', () => {
    // The owner's sample: Apr to Oct 2021 at 5k each, paid from a 50k credit.
    const summary = buildStatementLedger({
      openingBalance: -50_000,
      invoices: Array.from({ length: 7 }, (_, i) => monthly('Security Levy', 2021, i + 4, 5_000)),
      payments: [], walletTransactions: [], mode: 'summary',
    });
    expect(rows(summary)).toEqual([
      ['Security Levy · Apr – Oct 2021 · 7 invoices', 35_000, 0, -15_000],
    ]);
  });

  it('never merges a credit-paid invoice with one that adds to the debt', () => {
    const summary = buildStatementLedger({
      openingBalance: -20_000,
      invoices: [1, 2, 3, 4].map((m) => monthly('Dues', 2026, m, 10_000)),
      payments: [], walletTransactions: [], mode: 'summary',
    });
    expect(rows(summary)).toEqual([
      ['Dues · Jan – Feb 2026 · 2 invoices', 20_000, 0, 0],
      ['Dues · Mar – Apr 2026 · 2 invoices', 20_000, 0, 20_000],
    ]);
  });

  it('stops a run at a manual wallet row, a new amount, another item and a missing month', () => {
    const summary = buildStatementLedger({
      openingBalance: 0,
      invoices: [
        monthly('Dues', 2026, 1, 10_000), monthly('Dues', 2026, 2, 10_000),
        monthly('Dues', 2026, 3, 10_000), monthly('Dues', 2026, 4, 10_000),
        monthly('Dues', 2026, 5, 12_500), monthly('Dues', 2026, 6, 12_500),
        monthly('Dues', 2026, 8, 12_500), monthly('Dues', 2026, 9, 12_500),
        monthly('Waste', 2026, 10, 12_500, 'w-10'),
      ],
      payments: [],
      walletTransactions: [
        { id: 'w1', type: 'debit' as const, amount: 500, description: 'Manual debit', reference_type: null, reference_id: null, created_at: '2026-02-15T09:00:00Z' },
      ],
      mode: 'summary',
    });
    expect(summary.transactions.map((t) => t.description)).toEqual([
      'Dues · Jan – Feb 2026 · 2 invoices',
      'Manual debit',
      'Dues · Mar – Apr 2026 · 2 invoices',
      'Dues · May – Jun 2026 · 2 invoices',
      'Dues · Aug – Sep 2026 · 2 invoices',
      'Invoice #INV-w-10 - Waste, OCT 2026',
    ]);
  });

  it('never merges an invoice without a billing period', () => {
    const undated = { ...monthly('Dues', 2026, 2, 10_000), period_start: null, created_at: '2026-02-10T00:00:00Z' };
    const summary = buildStatementLedger({
      openingBalance: 0, invoices: [monthly('Dues', 2026, 1, 10_000), undated], payments: [], walletTransactions: [], mode: 'summary',
    });
    expect(summary.transactions.map((t) => t.invoice_count)).toEqual([undefined, undefined]);
  });

  it('matches the detailed statement on totals, closing balance and the final running balance', () => {
    const detailed = buildStatementLedger(sample());
    const summary = buildStatementLedger({ ...sample(), mode: 'summary' });
    expect(summary.summary).toEqual(detailed.summary);
    expect(summary.closingBalance).toBe(detailed.closingBalance);
    expect(summary.transactions.at(-1)?.balance).toBe(detailed.closingBalance);
  });

  it('exposes every monthly invoice for the appendix, and leaves detailed output unchanged', () => {
    const detailed = buildStatementLedger(sample());
    const summary = buildStatementLedger({ ...sample(), mode: 'summary' });
    expect(summary.monthlyInvoices).toHaveLength(12);
    expect(summary.monthlyInvoices).toEqual(detailed.transactions.filter((t) => t.type === 'invoice'));
    expect(buildStatementLedger({ ...sample(), mode: 'detailed' }).transactions).toEqual(detailed.transactions);
    expect(detailed.transactions).toHaveLength(14);
  });
});
