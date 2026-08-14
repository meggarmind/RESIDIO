import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  callWalletPaymentRpc: vi.fn(),
  callWalletPaymentBatchReversal: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/billing/wallet-payment-rpc', () => ({
  callWalletPaymentRpc: mocks.callWalletPaymentRpc,
  callWalletPaymentBatchReversal: mocks.callWalletPaymentBatchReversal,
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { settleWalletInvoices } from '@/actions/billing/settle-wallet-invoices';
import { reverseWalletPaymentBatch } from '@/actions/billing/reverse-wallet-payment-batch';
import { prepayFutureInvoices } from '@/actions/billing/prepay-future-invoices';

const residentId = '11111111-1111-4111-8111-111111111111';
const earlyInvoiceId = '22222222-2222-4222-8222-222222222222';
const lateInvoiceId = '33333333-3333-4333-8333-333333333333';
const batchId = '44444444-4444-4444-8444-444444444444';

function queryResult<T>(data: T, error: { message: string } | null = null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    then: (resolve: (value: { data: T; error: { message: string } | null }) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  return chain;
}

describe('admin wallet settlement actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: '55555555-5555-4555-8555-555555555555' });
    mocks.createServerSupabaseClient.mockResolvedValue({
      from: vi.fn(() => queryResult([
        {
          id: lateInvoiceId,
          resident_id: residentId,
          house_id: null,
          status: 'unpaid',
          amount_due: 50000,
          amount_paid: 0,
          period_start: '2025-10-01',
          period_end: '2025-10-31',
        },
        {
          id: earlyInvoiceId,
          resident_id: residentId,
          house_id: null,
          status: 'unpaid',
          amount_due: 50000,
          amount_paid: 0,
          period_start: '2025-09-01',
          period_end: '2025-09-30',
        },
      ])),
    });
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it('checks authorization before opening the database client', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Denied' });

    await expect(settleWalletInvoices({ residentId, invoiceIds: [earlyInvoiceId] })).resolves.toEqual({
      success: false,
      error: 'Denied',
    });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('orders selected invoices by period and returns partial settlement counts', async () => {
    mocks.callWalletPaymentRpc.mockResolvedValue({
      data: {
        success: true,
        batch_id: batchId,
        receipt_number: 'RCP-20260813-00001',
        total_allocated: 70000,
        period_start: '2025-09-01',
        period_end: '2025-09-30',
        allocations: [
          { status_after: 'paid', balance_after: 0 },
          { status_after: 'partially_paid', balance_after: 30000 },
        ],
      },
      error: null,
    });

    const result = await settleWalletInvoices({
      residentId,
      invoiceIds: [lateInvoiceId, earlyInvoiceId],
      paymentDate: '2025-10-01',
    });

    expect(result).toMatchObject({
      success: true,
      batchId,
      fullyPaidCount: 1,
      partialCount: 1,
      totalAllocated: 70000,
      remainingOutstanding: 30000,
    });
    expect(mocks.callWalletPaymentRpc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      p_invoice_ids: [earlyInvoiceId, lateInvoiceId],
      p_credit_amount: 0,
      p_payment_date: '2025-10-01',
    }));
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });

  it('does not reverse an invalid batch identifier', async () => {
    await expect(reverseWalletPaymentBatch('not-a-uuid')).resolves.toEqual({
      success: false,
      error: 'Invalid wallet payment batch',
    });
    expect(mocks.callWalletPaymentBatchReversal).not.toHaveBeenCalled();
  });

  it('returns the atomic reversal result and audits it', async () => {
    mocks.callWalletPaymentBatchReversal.mockResolvedValue({
      data: { success: true, batch_id: batchId, total_reversed: 70000, new_wallet_balance: 70000 },
      error: null,
    });

    await expect(reverseWalletPaymentBatch(batchId)).resolves.toEqual({
      success: true,
      batchId,
      totalReversed: 70000,
      newWalletBalance: 70000,
    });
    expect(mocks.callWalletPaymentBatchReversal).toHaveBeenCalledWith(expect.anything(), {
      p_batch_id: batchId,
      p_reversed_by: '55555555-5555-4555-8555-555555555555',
    });
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid future prepayment range before database access', async () => {
    const result = await prepayFutureInvoices({
      residentId,
      houseId: '66666666-6666-4666-8666-666666666666',
      startMonth: '2026-10-01',
      endMonth: '2026-09-01',
      method: 'bank_transfer',
    });

    expect(result).toEqual({ success: false, error: 'Select a valid future month range' });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });
});
