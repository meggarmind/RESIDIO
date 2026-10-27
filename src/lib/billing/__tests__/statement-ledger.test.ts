import { describe, expect, it } from 'vitest';
import { buildStatementLedger, type LedgerInvoice, type LedgerPayment, type LedgerWalletTransaction } from '@/lib/billing/statement-ledger';

function invoice(overrides: Partial<LedgerInvoice> = {}): LedgerInvoice {
  return {
    id: 'i1',
    invoice_number: 'LEGACY-IBB-1-2015-01',
    amount_due: 5000,
    status: 'paid',
    invoice_type: 'SERVICE_CHARGE',
    period_start: '2015-01-01',
    period_end: '2015-01-31',
    // Legacy rows carry the import date here.
    created_at: '2026-08-09T22:35:50Z',
    charge_name: '5k per month',
    ...overrides,
  };
}

function payment(overrides: Partial<LedgerPayment> = {}): LedgerPayment {
  return { id: 'p1', amount: 5000, payment_date: '2015-01-01', reference_number: 'TRX-1', method: 'bank_transfer', notes: null, ...overrides };
}

function walletTx(overrides: Partial<LedgerWalletTransaction> = {}): LedgerWalletTransaction {
  return { id: 'w1', type: 'credit', amount: 5000, description: null, reference_type: 'payment', reference_id: 'p1', created_at: '2015-01-01T00:00:00Z', ...overrides };
}

describe('buildStatementLedger', () => {
  it('names each invoice line by its charge, with the month for dues and the type when there is no profile', () => {
    const { transactions } = buildStatementLedger({
      openingBalance: 0,
      invoices: [
        invoice({ id: 'a', charge_name: 'Security dues', period_start: '2026-10-01', period_end: '2026-10-31' }),
        invoice({ id: 'b', invoice_number: 'LEV-1', invoice_type: 'LEVY', charge_name: null, period_start: '2026-11-01', period_end: null }),
      ],
      payments: [],
      walletTransactions: [],
    });
    expect(transactions.map((t) => t.description)).toEqual(['Invoice #LEGACY-IBB-1-2015-01 - Security dues, OCT 2026', 'Invoice #LEV-1 - Levy']);
  });

  it('dates an invoice by the period it bills, not the day it was imported', () => {
    const { transactions } = buildStatementLedger({ openingBalance: 0, invoices: [invoice()], payments: [], walletTransactions: [] });
    expect(transactions[0].date).toBe('2015-01-01');
  });

  it('falls back to created_at when an invoice has no period', () => {
    const { transactions } = buildStatementLedger({
      openingBalance: 0,
      invoices: [invoice({ period_start: null, period_end: null, created_at: '2026-01-05T10:00:00Z' })],
      payments: [],
      walletTransactions: [],
    });
    expect(transactions[0].date).toBe('2026-01-05T10:00:00Z');
    expect(transactions[0].period).toBeUndefined();
  });

  it('does not count a payment twice through its mirrored wallet credit', () => {
    const result = buildStatementLedger({
      openingBalance: 0,
      invoices: [invoice()],
      payments: [payment()],
      walletTransactions: [walletTx(), walletTx({ id: 'w2', type: 'debit', reference_type: 'invoice', reference_id: 'i1' })],
    });
    expect(result.transactions.map((t) => t.type)).toEqual(['invoice', 'payment']);
    expect(result.summary.totalCredits).toBe(0);
    expect(result.closingBalance).toBe(0);
  });

  it('keeps wallet credits that no payment row represents', () => {
    const result = buildStatementLedger({
      openingBalance: 10000,
      invoices: [],
      payments: [],
      walletTransactions: [walletTx({ reference_type: 'legacy_tracker_credit', amount: 4000, description: 'Tracker credit' })],
    });
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ type: 'wallet_credit', credit: 4000, balance: 6000, description: 'Tracker credit' });
    expect(result.summary.totalCredits).toBe(4000);
    expect(result.closingBalance).toBe(6000);
  });

  it('carries the payment reference_number onto the statement', () => {
    const { transactions } = buildStatementLedger({ openingBalance: 0, invoices: [], payments: [payment()], walletTransactions: [] });
    expect(transactions[0].reference).toBe('TRX-1');
  });

  it('posts a same-day charge before the receipt that settles it', () => {
    const { transactions } = buildStatementLedger({ openingBalance: 0, invoices: [invoice()], payments: [payment()], walletTransactions: [] });
    expect(transactions.map((t) => [t.type, t.balance])).toEqual([['invoice', 5000], ['payment', 0]]);
  });

  it('posts a same-day wallet debit before a payment, though wallet rows are gathered last', () => {
    const { transactions } = buildStatementLedger({
      openingBalance: 0,
      invoices: [],
      payments: [payment({ payment_date: '2015-03-01' })],
      walletTransactions: [walletTx({ type: 'debit', reference_type: 'adjustment', amount: 5000, created_at: '2015-03-01' })],
    });
    expect(transactions.map((t) => [t.type, t.balance])).toEqual([['wallet_debit', 5000], ['payment', 0]]);
  });

  it('runs the balance from the opening balance in date order and totals each kind', () => {
    const result = buildStatementLedger({
      openingBalance: 2000,
      invoices: [
        invoice({ id: 'i2', period_start: '2015-02-01', period_end: '2015-02-28', amount_due: 10000 }),
        invoice(),
      ],
      payments: [payment({ amount: 3000, payment_date: '2015-01-15' })],
      walletTransactions: [walletTx({ id: 'w3', type: 'debit', reference_type: 'adjustment', amount: 500, created_at: '2015-03-01T00:00:00Z' })],
    });
    expect(result.transactions.map((t) => t.balance)).toEqual([7000, 4000, 14000, 14500]);
    expect(result.summary).toEqual({ totalInvoiced: 15000, totalPaid: 3000, totalCredits: 0, totalDebits: 500, netChange: 12500 });
    expect(result.closingBalance).toBe(14500);
  });

  it('keeps Opening + Charges + Debits - Payments - Credits = Closing, and the last running balance on it, for varied rows (#863)', () => {
    // Seeded so a failure reproduces; amounts in kobo so the expected sum is exact.
    let seed = 863;
    const next = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    const naira = () => (next(5_000_000) + 1) / 100;
    for (let round = 0; round < 50; round++) {
      const day = () => `2026-${String(next(12) + 1).padStart(2, '0')}-${String(next(28) + 1).padStart(2, '0')}`;
      const invoices = Array.from({ length: next(6) }, (_, i) => invoice({ id: `i${i}`, amount_due: naira(), period_start: day() }));
      const payments = Array.from({ length: next(6) }, (_, i) => payment({ id: `p${i}`, amount: naira(), payment_date: day() }));
      const walletTransactions = Array.from({ length: next(6) }, (_, i) =>
        walletTx({ id: `w${i}`, type: next(2) ? 'credit' : 'debit', amount: naira(), reference_type: ['payment', 'invoice', null, 'legacy_tracker_credit'][next(4)], created_at: `${day()}T10:00:00Z` }));
      const openingBalance = (next(2_000_000) - 1_000_000) / 100;

      const { summary, closingBalance, transactions } = buildStatementLedger({ openingBalance, invoices, payments, walletTransactions });

      const kobo = (n: number) => Math.round(n * 100);
      expect(kobo(openingBalance) + kobo(summary.totalInvoiced) + kobo(summary.totalDebits) - kobo(summary.totalPaid) - kobo(summary.totalCredits)).toBe(kobo(closingBalance));
      expect(kobo(transactions.at(-1)?.balance ?? openingBalance)).toBe(kobo(closingBalance));
      const counted = walletTransactions.filter((tx) => tx.reference_type !== 'payment' && tx.reference_type !== 'invoice');
      expect(kobo(summary.totalCredits)).toBe(counted.filter((tx) => tx.type === 'credit').reduce((sum, tx) => sum + kobo(tx.amount), 0));
      expect(kobo(summary.totalPaid)).toBe(payments.reduce((sum, p) => sum + kobo(p.amount ?? 0), 0));
    }
  });
});
