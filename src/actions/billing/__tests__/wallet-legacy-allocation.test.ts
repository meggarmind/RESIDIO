/**
 * #778: the legacy (no batch options) allocator stops when the wallet empties, taking
 * the balance from each debit result instead of re-reading the wallet per invoice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  debit: vi.fn(),
  tables: [] as string[],
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/billing/wallet-invoice-debit', () => ({ debitWalletForInvoiceAtomic: mocks.debit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { allocateWalletToInvoices } from '@/actions/billing/wallet';

const INVOICES = ['inv-1', 'inv-2', 'inv-3'].map((id) => ({ id, amount_due: 100, amount_paid: 0 }));
let walletBalance: number;

function fakeSupabase() {
  return {
    from(table: string) {
      mocks.tables.push(table);
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gte', 'neq', 'order']) chain[m] = () => chain;
      chain.single = async () => ({ data: { id: 'wallet-1', resident_id: 'res-1', balance: walletBalance }, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: INVOICES, error: null }).then(resolve);
      return chain;
    },
  };
}

// The fake wallet row follows each reported post-debit balance, as the real RPC would.
const debited = (amount: number, newBalance: number | null) => () => {
  if (newBalance !== null) walletBalance = newBalance;
  return Promise.resolve({ success: true, amountDebited: amount, walletId: 'wallet-1', newBalance, invoiceNumber: null, error: null });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.debit.mockReset();
  mocks.tables.length = 0;
  walletBalance = 0;
  mocks.createServerSupabaseClient.mockImplementation(async () => fakeSupabase());
});

describe('allocateWalletToInvoices legacy loop (#778)', () => {
  it('stops when the balance reaches zero mid-list, without re-reading the wallet', async () => {
    mocks.debit.mockImplementationOnce(debited(100, 50)).mockImplementationOnce(debited(50, 0));
    const res = await allocateWalletToInvoices('res-1');
    expect(res).toEqual({ success: true, invoicesPaid: 2, totalAllocated: 150, error: null });
    expect(mocks.debit).toHaveBeenCalledTimes(2);
    expect(mocks.tables).not.toContain('resident_wallets');
  });

  it('stops on an insufficient-balance debit', async () => {
    mocks.debit.mockResolvedValueOnce({ success: false, amountDebited: 0, walletId: null, newBalance: null, invoiceNumber: null, error: 'Insufficient wallet balance' });
    const res = await allocateWalletToInvoices('res-1');
    expect(res).toEqual({ success: true, invoicesPaid: 0, totalAllocated: 0, error: null });
    expect(mocks.debit).toHaveBeenCalledTimes(1);
  });

  it('falls back to reading the wallet when the debit reports no balance', async () => {
    walletBalance = 10;
    mocks.debit.mockImplementation(debited(100, null));
    const res = await allocateWalletToInvoices('res-1');
    expect(res.totalAllocated).toBe(300);
    expect(mocks.debit).toHaveBeenCalledTimes(3);
    expect(mocks.tables.filter((t) => t === 'resident_wallets')).toHaveLength(3);
  });

  it('stops inside the payment house too', async () => {
    mocks.debit.mockImplementationOnce(debited(100, 0));
    const res = await allocateWalletToInvoices('res-1', 'house-1');
    expect(res).toEqual({ success: true, invoicesPaid: 1, totalAllocated: 100, error: null });
    expect(mocks.debit).toHaveBeenCalledTimes(1);
  });
});
