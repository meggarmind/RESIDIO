import { beforeEach, describe, expect, it, vi } from 'vitest';

// #995: a correction's credit must stop the original invoice counting as owed, and must not
// be refundable to the wallet as if it were a payment.

type Result = { data: unknown; error: unknown };
type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  // Responses per table, consumed in order by `.single()` and by awaiting a query.
  singles: {} as Record<string, Result[]>,
  lists: {} as Record<string, Result[]>,
  rpc: vi.fn(),
}));

function builder(table: string): Record<string, unknown> {
  const call: Call = { table, op: 'select', filters: [] };
  state.calls.push(call);
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  for (const m of ['eq', 'neq']) {
    chain[m] = vi.fn((col: string, val: unknown) => {
      call.filters.push([m, col, val]);
      return chain;
    });
  }
  for (const op of ['insert', 'update']) {
    chain[op] = vi.fn((payload: unknown) => {
      call.op = op;
      call.payload = payload;
      return chain;
    });
  }
  chain.single = vi.fn(async () => state.singles[table]?.shift() ?? { data: null, error: { message: 'not found' } });
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve(state.lists[table]?.shift() ?? { data: [], error: null });
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) => builder(table),
    rpc: state.rpc,
  }),
}));
vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: async () => ({ authorized: true, userId: 'user-1' }),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock('@/actions/billing/wallet', () => ({ allocateWalletToInvoices: vi.fn() }));
vi.mock('@/actions/notifications/send-correction-notification', () => ({
  sendCorrectionNotification: vi.fn(),
}));

import { createInvoiceCorrection } from '@/actions/billing/create-invoice-correction';
import { reversePaymentAllocation } from '@/actions/billing/reverse-payment-allocation';

const ORIGINAL = {
  id: 'inv-1',
  invoice_number: 'INV-1',
  resident_id: 'r1',
  house_id: 'h1',
  billing_profile_id: 'bp1',
  amount_due: 25000,
  amount_paid: 0,
  status: 'unpaid',
  period_start: '2026-10-01',
  period_end: '2026-10-31',
};

const note = (amount_due: number, amount_paid: number, status: string) => ({
  data: { id: `n-${amount_due}`, amount_due, amount_paid, status },
  error: null,
});

const invoiceUpdates = () =>
  state.calls.filter((c) => c.table === 'invoices' && c.op === 'update');

/** Outstanding the way the unpaid-based balance functions read it. */
function outstanding(rows: Array<{ amount_due: number; amount_paid: number; status: string }>) {
  return rows
    .filter((r) => ['unpaid', 'partially_paid', 'overdue'].includes(r.status))
    .reduce((sum, r) => sum + r.amount_due - r.amount_paid, 0);
}

const base = {
  originalInvoiceId: 'inv-1',
  reason: 'Split into security dues and access card',
  skipWalletReallocation: true,
  skipEmailNotification: true,
};

beforeEach(() => {
  state.calls = [];
  state.singles = {};
  state.lists = {};
  state.rpc.mockReset();
});

describe('createInvoiceCorrection applies the credit to the original invoice', () => {
  it('a 25k split into 20k + 5k leaves the resident owing 25k, not 50k', async () => {
    state.singles.invoices = [
      { data: ORIGINAL, error: null },
      note(-25000, -25000, 'paid'),
      note(20000, 0, 'unpaid'),
      note(5000, 0, 'unpaid'),
    ];
    state.lists.invoices = [{ data: [{ id: 'inv-1' }], error: null }];

    const result = await createInvoiceCorrection({
      ...base,
      corrections: [
        { type: 'credit', amount: 25000, description: 'Reverse' },
        { type: 'debit', amount: 20000, description: 'Security dues' },
        { type: 'debit', amount: 5000, description: 'Access card' },
      ],
    });

    expect(result.success).toBe(true);
    const [claim] = invoiceUpdates();
    expect(claim.payload).toEqual({ amount_paid: 25000, status: 'paid' });
    expect(claim.filters).toEqual([
      ['eq', 'id', 'inv-1'],
      ['eq', 'amount_paid', 0],
    ]);

    const original = { ...ORIGINAL, ...(claim.payload as object) };
    const notes = [...result.creditNotes, ...result.debitNotes] as unknown as typeof ORIGINAL[];
    expect(outstanding([original, ...notes])).toBe(25000);
    // Roll-forward ledger (Σ amount_due of non-void invoices) is unchanged by the fix.
    expect([original, ...notes].reduce((s, r) => s + r.amount_due, 0)).toBe(25000);
  });

  it('a partial credit leaves the rest of the original owed', async () => {
    state.singles.invoices = [
      { data: ORIGINAL, error: null },
      note(-5000, -5000, 'paid'),
      note(5000, 0, 'unpaid'),
    ];
    state.lists.invoices = [{ data: [{ id: 'inv-1' }], error: null }];

    const result = await createInvoiceCorrection({
      ...base,
      corrections: [
        { type: 'credit', amount: 5000, description: 'Wrong amount' },
        { type: 'debit', amount: 5000, description: 'Access card' },
      ],
    });

    expect(result.success).toBe(true);
    expect(invoiceUpdates()[0].payload).toEqual({ amount_paid: 5000, status: 'partially_paid' });
  });

  it('rejects credits larger than the invoice without writing', async () => {
    state.singles.invoices = [{ data: ORIGINAL, error: null }];

    const result = await createInvoiceCorrection({
      ...base,
      corrections: [
        { type: 'credit', amount: 30000, description: 'Too much' },
        { type: 'debit', amount: 30000, description: 'New' },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cannot exceed/);
    expect(state.calls.filter((c) => c.op !== 'select')).toEqual([]);
  });

  it('stops before creating notes when the invoice changed underneath it', async () => {
    state.singles.invoices = [{ data: ORIGINAL, error: null }];
    state.lists.invoices = [{ data: [], error: null }];

    const result = await createInvoiceCorrection({
      ...base,
      corrections: [
        { type: 'credit', amount: 25000, description: 'Reverse' },
        { type: 'debit', amount: 25000, description: 'New' },
      ],
    });

    expect(result.success).toBe(false);
    expect(state.calls.filter((c) => c.op === 'insert')).toEqual([]);
  });

  it('restores the original when the credit note cannot be saved', async () => {
    state.singles.invoices = [
      { data: ORIGINAL, error: null },
      { data: null, error: { message: 'insert failed' } },
    ];
    state.lists.invoices = [{ data: [{ id: 'inv-1' }], error: null }];

    const result = await createInvoiceCorrection({
      ...base,
      corrections: [
        { type: 'credit', amount: 25000, description: 'Reverse' },
        { type: 'debit', amount: 25000, description: 'New' },
      ],
    });

    expect(result.success).toBe(false);
    const updates = invoiceUpdates();
    expect(updates).toHaveLength(2);
    expect(updates[1].payload).toEqual({ amount_paid: 0, status: 'unpaid' });
  });
});

describe('reversePaymentAllocation never refunds correction credit', () => {
  it('refuses to send credit-note credit to the wallet', async () => {
    state.singles.invoices = [{ data: { amount_paid: 25000 }, error: null }];
    state.lists.invoices = [{ data: [{ amount_due: -25000 }], error: null }];

    const result = await reversePaymentAllocation('inv-1', 1000);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cannot be refunded/);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('still reverses the part that was really paid', async () => {
    state.singles.invoices = [{ data: { amount_paid: 30000 }, error: null }];
    state.lists.invoices = [{ data: [{ amount_due: -25000 }], error: null }];
    state.rpc.mockResolvedValue({ data: { success: false, error: 'rpc reached' }, error: null });

    const result = await reversePaymentAllocation('inv-1', 5000);

    expect(state.rpc).toHaveBeenCalled();
    expect(result.error).toBe('rpc reached');
  });
});
