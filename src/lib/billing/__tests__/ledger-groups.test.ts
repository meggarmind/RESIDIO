import { describe, expect, it } from 'vitest';
import { groupInvoiceDebits, groupPeriodLabel, type GroupableLedgerRow } from '@/lib/billing/ledger-groups';

const debit = (id: string, item: string | null, month: number, amount: number, balance: number): GroupableLedgerRow => ({
  id, type: 'debit', created_at: `2026-${String(month).padStart(2, '0')}-15T10:00:00Z`, amount, balance_after: balance,
  reference_type: item ? 'invoice' : null, invoice_item: item, invoice_period_start: item ? `2026-${String(month).padStart(2, '0')}-01` : null,
});

describe('groupInvoiceDebits', () => {
  const rows: GroupableLedgerRow[] = [
    debit('d3', 'Security dues', 3, 100, 700),
    { id: 'c1', type: 'credit', created_at: '2026-03-01T10:00:00Z', amount: 900, balance_after: 900 },
    debit('d2', 'Security dues', 2, 100, 800),
    debit('w2', 'Waste', 2, 50, 850),
    debit('m1', null, 2, 25, 875),
    debit('d1', 'Security dues', 1, 100, 900),
  ];
  const entries = groupInvoiceDebits(rows);

  it('combines same-item invoice debits with total, count and the newest balance', () => {
    const group = entries.find((e) => e.kind === 'group' && e.item === 'Security dues');
    expect(group).toMatchObject({ total: 300, closingBalance: 700 });
    expect(group?.kind === 'group' && group.rows.map((r) => r.id)).toEqual(['d3', 'd2', 'd1']);
    expect(group?.kind === 'group' && groupPeriodLabel(group.rows)).toBe('Jan–Mar 2026');
  });

  it('leaves credits, non-invoice debits and a lone invoice debit as rows', () => {
    expect(entries.filter((e) => e.kind === 'row').map((e) => e.kind === 'row' && e.row.id)).toEqual(['c1', 'w2', 'm1']);
  });

  it('does not change the debit total', () => {
    const total = entries.reduce((sum, e) => sum + (e.kind === 'group' ? e.total : e.row.type === 'debit' ? e.row.amount : 0), 0);
    expect(total).toBe(rows.filter((r) => r.type === 'debit').reduce((s, r) => s + r.amount, 0));
  });
});
