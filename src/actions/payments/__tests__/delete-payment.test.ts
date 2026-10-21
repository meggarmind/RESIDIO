import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  callWalletPaymentBatchReversal: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/billing/wallet-payment-rpc', () => ({
  callWalletPaymentBatchReversal: mocks.callWalletPaymentBatchReversal,
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));

import { deletePayment } from '@/actions/payments/delete-payment';

const paymentId = '11111111-1111-4111-8111-111111111111';
const residentId = '22222222-2222-4222-8222-222222222222';
const batchId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const payment = { id: paymentId, resident_id: residentId, amount: 50000, reference_number: 'REF-1' };

// In-memory books: one invoice paid by the payment, and the resident's wallet.
type Books = {
  invoice: { amount_paid: number; status: string };
  wallet: number;
  batches: Array<{ id: string; status: string; allocated: number; credit: number }>;
  ledger: Array<{ type: string; amount: number; reference_type: string }>;
  paymentExists: boolean;
  deleteError: { message: string } | null;
};

function chain(result: () => { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in']) c[m] = vi.fn(() => c);
  c.single = vi.fn(async () => result());
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return c;
}

function makeClient(books: Books) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'payment_records') {
        const c = chain(() => ({ data: books.paymentExists ? payment : null, error: null }));
        c.delete = vi.fn(() => ({
          eq: vi.fn(async () => {
            if (books.deleteError) return { error: books.deleteError };
            books.paymentExists = false;
            return { error: null };
          }),
        }));
        return c;
      }
      if (table === 'wallet_payment_batches') {
        return chain(() => ({ data: books.batches.map(({ id, status }) => ({ id, status })), error: null }));
      }
      if (table === 'resident_wallets') {
        return chain(() => ({ data: { balance: books.wallet }, error: null }));
      }
      if (table === 'wallet_payment_batch_items') {
        return chain(() => ({ data: books.batches.map((b) => ({ amount_allocated: b.allocated })), error: null }));
      }
      if (table === 'wallet_transactions') {
        return chain(() => ({ data: books.ledger, error: null }));
      }
      throw new Error(`unexpected table ${table}`);
    }),
    rpc: vi.fn(async (name: string, args: { p_amount: number }) => {
      if (name !== 'adjust_wallet_debit') throw new Error(`unexpected rpc ${name}`);
      if (books.wallet < args.p_amount) return { data: null, error: { message: 'Insufficient wallet balance' } };
      books.wallet -= args.p_amount;
      books.ledger.push({ type: 'debit', amount: args.p_amount, reference_type: 'payment_deletion' });
      return { data: { success: true, wallet_id: 'w1', new_balance: books.wallet }, error: null };
    }),
  };
}

describe('deletePayment (#993)', () => {
  let books: Books;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermission.mockResolvedValue({ authorized: true, userId });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.callWalletPaymentBatchReversal.mockImplementation(async (_client: unknown, args: { p_batch_id: string }) => {
      const batch = books.batches.find((b) => b.id === args.p_batch_id)!;
      books.invoice = { amount_paid: books.invoice.amount_paid - batch.allocated, status: 'unpaid' };
      books.wallet = books.wallet + batch.allocated - batch.credit;
      batch.status = 'reversed';
      return { data: { success: true, batch_id: batch.id, total_reversed: batch.allocated, new_wallet_balance: books.wallet }, error: null };
    });
  });

  it('reverses the invoice allocation and wallet credit of an allocated payment', async () => {
    // ₦50,000 credited to the wallet, then all of it allocated to the invoice.
    books = {
      invoice: { amount_paid: 50000, status: 'paid' },
      wallet: 0,
      batches: [{ id: batchId, status: 'completed', allocated: 50000, credit: 50000 }],
      ledger: [{ type: 'credit', amount: 50000, reference_type: 'payment' }],
      paymentExists: true,
      deleteError: null,
    };
    mocks.createServerSupabaseClient.mockResolvedValue(makeClient(books));

    await expect(deletePayment(paymentId)).resolves.toEqual({ success: true, error: null });

    expect(mocks.callWalletPaymentBatchReversal).toHaveBeenCalledWith(expect.anything(), {
      p_batch_id: batchId,
      p_reversed_by: userId,
    });
    expect(books.invoice).toEqual({ amount_paid: 0, status: 'unpaid' });
    expect(books.wallet).toBe(0);
    expect(books.paymentExists).toBe(false);
  });

  it('debits the wallet credit of a payment that was not allocated to any invoice', async () => {
    books = {
      invoice: { amount_paid: 0, status: 'unpaid' },
      wallet: 50000,
      batches: [],
      ledger: [{ type: 'credit', amount: 50000, reference_type: 'payment' }],
      paymentExists: true,
      deleteError: null,
    };
    mocks.createServerSupabaseClient.mockResolvedValue(makeClient(books));

    await expect(deletePayment(paymentId)).resolves.toEqual({ success: true, error: null });

    expect(books.wallet).toBe(0);
    expect(books.paymentExists).toBe(false);
  });

  it('refuses the delete when the reversal fails, leaving the payment in place', async () => {
    books = {
      invoice: { amount_paid: 50000, status: 'paid' },
      wallet: 0,
      batches: [{ id: batchId, status: 'completed', allocated: 50000, credit: 50000 }],
      ledger: [],
      paymentExists: true,
      deleteError: null,
    };
    mocks.createServerSupabaseClient.mockResolvedValue(makeClient(books));
    mocks.callWalletPaymentBatchReversal.mockResolvedValue({ data: null, error: { message: 'Not authorized' } });

    await expect(deletePayment(paymentId)).resolves.toEqual({
      success: false,
      error: 'Payment not deleted: Not authorized',
    });
    expect(books.paymentExists).toBe(true);
    expect(books.invoice).toEqual({ amount_paid: 50000, status: 'paid' });
  });

  it('refuses the delete when the unallocated credit has already been spent', async () => {
    books = {
      invoice: { amount_paid: 0, status: 'unpaid' },
      wallet: 10000,
      batches: [],
      ledger: [{ type: 'credit', amount: 50000, reference_type: 'payment' }],
      paymentExists: true,
      deleteError: null,
    };
    mocks.createServerSupabaseClient.mockResolvedValue(makeClient(books));

    await expect(deletePayment(paymentId)).resolves.toEqual({
      success: false,
      error: 'Payment not deleted: Insufficient wallet balance',
    });
    expect(books.paymentExists).toBe(true);
    expect(books.wallet).toBe(10000);
  });

  it('refuses the delete when the leftover credit of an allocated payment has been spent', async () => {
    // ₦50,000 paid, ₦30,000 allocated to the invoice, ₦20,000 left in the wallet and then spent.
    books = {
      invoice: { amount_paid: 30000, status: 'paid' },
      wallet: 0,
      batches: [{ id: batchId, status: 'completed', allocated: 30000, credit: 50000 }],
      ledger: [{ type: 'credit', amount: 50000, reference_type: 'payment' }],
      paymentExists: true,
      deleteError: null,
    };
    mocks.createServerSupabaseClient.mockResolvedValue(makeClient(books));

    const result = await deletePayment(paymentId);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient wallet balance');
    expect(mocks.callWalletPaymentBatchReversal).not.toHaveBeenCalled();
    expect(books.paymentExists).toBe(true);
    expect(books.invoice).toEqual({ amount_paid: 30000, status: 'paid' });
  });

  it('does not undo twice when a delete is retried after the row delete failed', async () => {
    books = {
      invoice: { amount_paid: 0, status: 'unpaid' },
      wallet: 50000,
      batches: [],
      ledger: [{ type: 'credit', amount: 50000, reference_type: 'payment' }],
      paymentExists: true,
      deleteError: { message: 'delete failed' },
    };
    mocks.createServerSupabaseClient.mockResolvedValue(makeClient(books));

    await expect(deletePayment(paymentId)).resolves.toEqual({ success: false, error: 'delete failed' });
    expect(books.wallet).toBe(0);

    books.deleteError = null;
    books.wallet = 70000; // unrelated money arrives before the retry
    await expect(deletePayment(paymentId)).resolves.toEqual({ success: true, error: null });
    expect(books.wallet).toBe(70000);
    expect(books.paymentExists).toBe(false);
  });

  it('checks authorization before opening the database client', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Denied' });
    await expect(deletePayment(paymentId)).resolves.toEqual({ success: false, error: 'Denied' });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });
});
