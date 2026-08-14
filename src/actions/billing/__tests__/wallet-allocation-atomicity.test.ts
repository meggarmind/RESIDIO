import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  callWalletPaymentRpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/billing/wallet-payment-rpc', () => ({ callWalletPaymentRpc: mocks.callWalletPaymentRpc }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { allocateWalletToInvoices } from '@/actions/billing/wallet';

const residentId = '11111111-1111-4111-8111-111111111111';
const invoiceId = '22222222-2222-4222-8222-222222222222';

function invoiceQuery() {
  const result = {
    id: invoiceId,
    amount_due: 50000,
    amount_paid: 0,
    period_start: '2025-09-01',
    period_end: '2025-09-30',
    due_date: '2025-09-01',
    house_id: null,
  };
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: (resolve: (value: { data: typeof result[]; error: null }) => unknown) =>
      Promise.resolve({ data: [result], error: null }).then(resolve),
  };
  return chain;
}

describe('ordinary wallet allocation atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: '55555555-5555-4555-8555-555555555555' });
    mocks.createServerSupabaseClient.mockResolvedValue({ from: vi.fn(() => invoiceQuery()) });
    mocks.callWalletPaymentRpc.mockResolvedValue({
      data: {
        success: true,
        batch_id: '33333333-3333-4333-8333-333333333333',
        receipt_number: 'RCP-20260813-00001',
        total_allocated: 50000,
        allocations: [{ invoice_id: invoiceId, amount_allocated: 50000 }],
      },
      error: null,
    });
  });

  it('passes the payment credit into the atomic settlement RPC', async () => {
    const result = await allocateWalletToInvoices(
      residentId,
      null,
      '2025-09-15',
      {
        sourcePaymentId: '44444444-4444-4444-8444-444444444444',
        batchAmount: 50000,
        batchType: 'payment_received',
        creditAmount: 50000,
      },
    );

    expect(result.success).toBe(true);
    expect(mocks.callWalletPaymentRpc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      p_credit_amount: 50000,
      p_batch_amount: 50000,
      p_batch_type: 'payment_received',
    }));
  });
});
