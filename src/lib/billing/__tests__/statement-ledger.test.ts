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
    billing_profile_name: '5k per month',
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
});
