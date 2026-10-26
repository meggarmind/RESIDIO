/**
 * #1190: a payment pays only invoices of its own charge category (Dues when it names none), and a
 * payment with a house pays only that house's invoices; leftover stays as credit (#1188 decision 3).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  callWalletPaymentRpc: vi.fn(),
  debit: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/billing/wallet-payment-rpc', () => ({ callWalletPaymentRpc: mocks.callWalletPaymentRpc }));
vi.mock('@/lib/billing/wallet-invoice-debit', () => ({ debitWalletForInvoiceAtomic: mocks.debit }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { allocateWalletToInvoices } from '@/actions/billing/wallet';

const RESIDENT = '11111111-1111-4111-8111-111111111111';
const PAYMENT = '44444444-4444-4444-8444-444444444444';
type Call = [string, ...unknown[]];

let invoiceRows: Array<{ id: string }>;
let invoiceQueries: Call[][];
let rpcCalls: Array<[string, Record<string, unknown>]>;

function fakeSupabase() {
  return {
    from(table: string) {
      const calls: Call[] = [];
      if (table === 'invoices') invoiceQueries.push(calls);
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'order']) {
        chain[m] = (...args: unknown[]) => {
          calls.push([m, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: invoiceRows, error: null }).then(resolve);
      return chain;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push([name, args]);
      return { data: { success: true, new_balance: Number(args.p_amount), wallet_id: 'w-1' }, error: null };
    },
  };
}

const filters = (calls: Call[], method: string) => calls.filter((c) => c[0] === method).map((c) => c.slice(1));

beforeEach(() => {
  vi.clearAllMocks();
  invoiceRows = [{ id: 'inv-a1' }, { id: 'inv-a2' }];
  invoiceQueries = [];
  rpcCalls = [];
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.createServerSupabaseClient.mockImplementation(async () => fakeSupabase());
  mocks.callWalletPaymentRpc.mockResolvedValue({ data: { success: true, total_allocated: 0, allocations: [] }, error: null });
});

const batch = { sourcePaymentId: PAYMENT, batchAmount: 5000, batchType: 'payment_received' as const, creditAmount: 5000 };

describe('payment allocation stays in its house and category (#1190)', () => {
  it('a levy payment for house A offers only house A levy invoices, in one query', async () => {
    await allocateWalletToInvoices(RESIDENT, 'house-a', '2026-11-20', { ...batch, chargeCategory: 'development_levy' });

    expect(invoiceQueries).toHaveLength(1);
    const [query] = invoiceQueries;
    expect(filters(query, 'eq')).toEqual(
      expect.arrayContaining([['house_id', 'house-a'], ['charge_category', 'development_levy'], ['resident_id', RESIDENT]])
    );
    expect(filters(query, 'eq')).not.toContainEqual(['charge_category', 'dues']);
    expect(filters(query, 'neq')).toEqual([]);
    expect(mocks.callWalletPaymentRpc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      p_invoice_ids: ['inv-a1', 'inv-a2'],
      p_house_id: 'house-a',
      p_charge_category: 'development_levy',
    }));
  });

  it('an untagged payment pays only Dues invoices', async () => {
    await allocateWalletToInvoices(RESIDENT, 'house-a', '2026-11-20', batch);

    expect(filters(invoiceQueries[0], 'eq')).toContainEqual(['charge_category', 'dues']);
    expect(mocks.callWalletPaymentRpc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ p_charge_category: 'dues' }));
  });

  it('a payment for house A with nothing owed there stays as credit in its category wallet', async () => {
    invoiceRows = [];
    const result = await allocateWalletToInvoices(RESIDENT, 'house-a', '2026-11-20', { ...batch, chargeCategory: 'transformer_fee' });

    expect(result).toMatchObject({ success: true, invoicesPaid: 0 });
    expect(invoiceQueries).toHaveLength(1);
    expect(mocks.callWalletPaymentRpc).not.toHaveBeenCalled();
    expect(rpcCalls).toEqual([
      ['adjust_wallet_credit', expect.objectContaining({ p_resident_id: RESIDENT, p_amount: 5000, p_charge_category: 'transformer_fee' })],
    ]);
  });

  it('the legacy allocator never leaves the house either', async () => {
    mocks.debit.mockResolvedValue({ success: true, amountDebited: 100, walletId: 'w-1', newBalance: 100, invoiceNumber: null, error: null });

    await allocateWalletToInvoices(RESIDENT, 'house-a');

    expect(invoiceQueries).toHaveLength(1);
    expect(filters(invoiceQueries[0], 'eq')).toEqual(expect.arrayContaining([['house_id', 'house-a'], ['charge_category', 'dues']]));
    expect(filters(invoiceQueries[0], 'neq')).toEqual([]);
    expect(mocks.debit.mock.calls.map((c) => c[2])).toEqual(['inv-a1', 'inv-a2']);
  });

  it('a category alone keeps the legacy allocator and uses that category (Paystack)', async () => {
    mocks.debit.mockResolvedValue({ success: true, amountDebited: 100, walletId: 'w-1', newBalance: 0, invoiceNumber: null, error: null });

    await allocateWalletToInvoices(RESIDENT, 'house-a', undefined, { chargeCategory: 'development_levy' });

    expect(mocks.callWalletPaymentRpc).not.toHaveBeenCalled();
    expect(filters(invoiceQueries[0], 'eq')).toContainEqual(['charge_category', 'development_levy']);
    expect(mocks.debit).toHaveBeenCalledTimes(1);
  });
});
