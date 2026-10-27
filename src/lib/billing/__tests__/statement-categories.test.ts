import { describe, expect, it } from 'vitest';
import {
  buildCategorySections,
  buildCollectionsSection,
  statementRowCount,
} from '@/lib/billing/statement-categories';

const categories = [
  { code: 'dues', name: 'Dues' },
  { code: 'development_levy', name: 'Development Levy' },
  { code: 'transformer_fee', name: 'Transformer Fee' },
];

const invoice = (id: string, amount: number, category: string, period = '2026-10-01') => ({
  id,
  invoice_number: id.toUpperCase(),
  amount_due: amount,
  status: 'unpaid',
  invoice_type: 'service_charge',
  period_start: period,
  period_end: period,
  created_at: `${period}T08:00:00Z`,
  billing_profile_name: null,
  charge_category: category,
});

const payment = (id: string, amount: number, category: string, date = '2026-10-10') => ({
  id,
  amount,
  payment_date: date,
  reference_number: null,
  method: 'bank_transfer',
  notes: null,
  charge_category: category,
});

describe('buildCategorySections (#1196)', () => {
  it('gives dues and a levy each their own running balance', () => {
    const sections = buildCategorySections({
      categories,
      openings: new Map([['dues', 10_000]]),
      invoices: [invoice('a', 50_000, 'dues'), invoice('b', 200_000, 'development_levy')],
      payments: [payment('p1', 30_000, 'dues'), payment('p2', 50_000, 'development_levy')],
      walletTransactions: [],
    });

    expect(sections.map((s) => s.code)).toEqual(['dues', 'development_levy']);
    const [dues, levy] = sections;
    expect(dues.openingBalance).toBe(10_000);
    expect(dues.closingBalance).toBe(30_000);
    expect(dues.transactions.map((t) => t.balance)).toEqual([60_000, 30_000]);
    expect(dues.summary.totalPaid).toBe(30_000);
    expect(levy.openingBalance).toBe(0);
    expect(levy.closingBalance).toBe(150_000);
    expect(levy.summary.totalInvoiced).toBe(200_000);
  });

  it('keeps a payment out of every category but its own', () => {
    const [dues, levy] = buildCategorySections({
      categories,
      openings: new Map(),
      invoices: [invoice('a', 50_000, 'dues'), invoice('b', 50_000, 'development_levy')],
      payments: [payment('p1', 50_000, 'development_levy')],
      walletTransactions: [],
    });
    expect(dues.closingBalance).toBe(50_000);
    expect(levy.closingBalance).toBe(0);
  });

  it('files a row with no category under dues', () => {
    const [only] = buildCategorySections({
      categories,
      openings: new Map(),
      invoices: [{ ...invoice('a', 5_000, 'dues'), charge_category: null }],
      payments: [],
      walletTransactions: [],
    });
    expect(only.code).toBe('dues');
    expect(only.closingBalance).toBe(5_000);
  });

  it('shows a category that has only a balance carried in, and omits one with nothing', () => {
    const sections = buildCategorySections({
      categories,
      openings: new Map([['transformer_fee', -2_500]]),
      invoices: [],
      payments: [],
      walletTransactions: [],
    });
    expect(sections.map((s) => s.code)).toEqual(['transformer_fee']);
    expect(sections[0].closingBalance).toBe(-2_500);
  });

  it('shows an empty Dues section rather than a blank statement', () => {
    const sections = buildCategorySections({ categories, openings: new Map(), invoices: [], payments: [], walletTransactions: [] });
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ code: 'dues', name: 'Dues', openingBalance: 0, closingBalance: 0, transactions: [] });
  });

  it('puts a wallet adjustment in the category of its wallet and skips mirrored rows', () => {
    const [dues, levy] = buildCategorySections({
      categories,
      openings: new Map(),
      invoices: [invoice('a', 10_000, 'dues')],
      payments: [],
      walletTransactions: [
        { id: 'w1', type: 'credit', amount: 4_000, description: 'Transfer', reference_type: 'wallet_transfer', reference_id: null, created_at: '2026-10-11T09:00:00Z', charge_category: 'development_levy' },
        { id: 'w2', type: 'debit', amount: 10_000, description: 'Invoice', reference_type: 'invoice', reference_id: 'a', created_at: '2026-10-12T09:00:00Z', charge_category: 'dues' },
      ],
    });
    expect(dues.closingBalance).toBe(10_000);
    expect(levy.code).toBe('development_levy');
    expect(levy.closingBalance).toBe(-4_000);
  });

  it('gives a category missing from the list its own section', () => {
    const sections = buildCategorySections({
      categories,
      openings: new Map(),
      invoices: [invoice('a', 1_000, 'legacy_fee')],
      payments: [],
      walletTransactions: [],
    });
    expect(sections.map((s) => s.code)).toEqual(['legacy_fee']);
  });

  it('folds monthly invoices per category in summary mode without changing balances', () => {
    const invoices = ['2026-01-01', '2026-02-01', '2026-03-01'].map((p, i) => invoice(`m${i}`, 1_000, 'dues', p));
    const [dues] = buildCategorySections({ categories, openings: new Map(), invoices, payments: [], walletTransactions: [], mode: 'summary' });
    expect(dues.transactions).toHaveLength(1);
    expect(dues.closingBalance).toBe(3_000);
    expect(dues.transactions[0].balance).toBe(3_000);
  });
});

describe('buildCollectionsSection (#1196)', () => {
  const row = (id: string, amount: number, extra: Partial<Parameters<typeof buildCollectionsSection>[0][number]> = {}) => ({
    id,
    amount,
    quantity: null,
    unit_price: null,
    payment_date: '2026-10-05',
    reference: null,
    receipt_number: `COL-2026-00000${id}`,
    collection: { name: 'Streetlights' },
    ...extra,
  });

  it('is absent when there are no payments', () => {
    expect(buildCollectionsSection([])).toBeUndefined();
  });

  it('totals the payments exactly and names each collection', () => {
    const section = buildCollectionsSection([
      row('1', 0.1),
      row('2', 0.2),
      row('3', 5_000, { quantity: 2, unit_price: '2500', collection: [{ name: 'Vehicle Sticker' }] }),
    ])!;
    expect(section.total).toBe(5_000.3);
    expect(section.lines.map((l) => l.collection_name)).toEqual(['Streetlights', 'Streetlights', 'Vehicle Sticker']);
    expect(section.lines[2]).toMatchObject({ quantity: 2, unit_price: 2_500 });
  });
});

describe('statementRowCount', () => {
  it('counts collection lines with the ledger rows', () => {
    expect(statementRowCount({ transactions: [1, 2, 3], collections: { lines: [1, 2] } })).toBe(5);
    expect(statementRowCount({ transactions: [1] })).toBe(1);
  });
});
