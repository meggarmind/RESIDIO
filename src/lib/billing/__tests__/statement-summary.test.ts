import { describe, expect, it } from 'vitest';
import { buildStatementLedger, type LedgerInvoice } from '@/lib/billing/statement-ledger';

const monthly = (name: string, year: number, month: number, amount: number, id = `${name}-${year}-${month}`): LedgerInvoice => ({
  id,
  invoice_number: `INV-${id}`,
  amount_due: amount,
  status: 'paid',
  invoice_type: 'SERVICE_CHARGE',
  period_start: `${year}-${String(month).padStart(2, '0')}-01`,
  period_end: null,
  created_at: '2026-10-01T00:00:00Z',
  billing_profile_name: name,
});

const input = () => ({
  openingBalance: 2000,
  invoices: [
    ...Array.from({ length: 10 }, (_, i) => monthly('Security dues', 2026, i + 1, 10_000)),
    monthly('Security dues', 2025, 12, 10_000),
    monthly('Waste', 2026, 3, 1500),
    monthly('Waste', 2026, 4, 1500),
    monthly('Levy', 2026, 5, 7000),
  ],
  payments: [{ id: 'p1', amount: 25_000, payment_date: '2026-03-15', reference_number: 'T1', method: 'bank_transfer', notes: null }],
  walletTransactions: [
    { id: 'w1', type: 'credit' as const, amount: 3000, description: 'Manual credit', reference_type: null, reference_id: null, created_at: '2026-06-02T09:00:00Z' },
    { id: 'w2', type: 'debit' as const, amount: 500, description: 'Manual debit', reference_type: null, reference_id: null, created_at: '2026-07-02T09:00:00Z' },
    { id: 'w3', type: 'debit' as const, amount: 10_000, description: null, reference_type: 'invoice', reference_id: 'x', created_at: '2026-02-02T09:00:00Z' },
  ],
});

describe('buildStatementLedger summary mode', () => {
  const detailed = buildStatementLedger(input());
  const summary = buildStatementLedger({ ...input(), mode: 'summary' });

  it('shows ten monthly invoices of one item and year as one line', () => {
    const line = summary.transactions.find((t) => t.description.startsWith('Security dues · Jan–Oct 2026'));
    expect(line?.description).toBe('Security dues · Jan–Oct 2026 · 10 invoices');
    expect(line?.debit).toBe(100_000);
    expect(line?.invoice_count).toBe(10);
  });

  it('keeps separate lines per billing item and per year, and leaves a lone invoice alone', () => {
    const descriptions = summary.transactions.map((t) => t.description);
    expect(descriptions).toContain('Waste · Mar–Apr 2026 · 2 invoices');
    expect(descriptions.filter((d) => d.includes('Security dues'))).toHaveLength(2);
    expect(descriptions).toContain('Invoice #INV-Security dues-2025-12 - Security dues, DEC 2025');
    expect(descriptions).toContain('Invoice #INV-Levy-2026-5 - Levy, MAY 2026');
  });

  it('keeps payments and manual wallet rows line by line', () => {
    expect(summary.transactions.filter((t) => t.type === 'payment')).toHaveLength(1);
    expect(summary.transactions.filter((t) => t.type === 'wallet_credit' || t.type === 'wallet_debit')).toHaveLength(2);
  });

  it('matches the detailed statement on totals and closing balance, and ends on the same running balance', () => {
    expect(summary.summary).toEqual(detailed.summary);
    expect(summary.closingBalance).toBe(detailed.closingBalance);
    expect(summary.transactions.at(-1)?.balance).toBe(detailed.transactions.at(-1)?.balance);
    expect(summary.transactions.at(-1)?.balance).toBe(detailed.closingBalance);
  });

  it('exposes every monthly invoice for the appendix', () => {
    expect(summary.monthlyInvoices).toHaveLength(14);
    expect(summary.monthlyInvoices).toEqual(detailed.transactions.filter((t) => t.type === 'invoice'));
  });

  it('leaves detailed output unchanged when no mode is given', () => {
    expect(buildStatementLedger({ ...input(), mode: 'detailed' }).transactions).toEqual(detailed.transactions);
    expect(detailed.transactions).toHaveLength(14 + 1 + 2);
  });
});
