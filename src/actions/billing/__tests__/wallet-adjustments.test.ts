import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { creditWallet, debitWallet } from '@/actions/billing/wallet';

const residentId = '11111111-1111-4111-8111-111111111111';
const referenceId = '22222222-2222-4222-8222-222222222222';
const walletId = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.createServerSupabaseClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({
    data: { success: true, new_balance: 125, wallet_id: walletId },
    error: null,
  });
});

describe('manual wallet adjustments', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '10'])('rejects malformed credit amount %s before database access', async (amount) => {
    const result = await creditWallet(residentId, amount as number, 'adjustment', referenceId, 'Correction');

    expect(result.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '10'])('rejects malformed debit amount %s before database access', async (amount) => {
    const result = await debitWallet(residentId, amount as number, 'adjustment', referenceId, 'Correction');

    expect(result.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['bad resident', () => creditWallet('resident', 10, 'adjustment', referenceId, 'Correction')],
    ['empty reference type', () => creditWallet(residentId, 10, ' ', referenceId, 'Correction')],
    ['bad reference id', () => creditWallet(residentId, 10, 'adjustment', 'reference', 'Correction')],
    ['empty description', () => creditWallet(residentId, 10, 'adjustment', referenceId, ' ')],
    ['missing adjustment description', () => creditWallet(residentId, 10, 'adjustment')],
  ])('rejects invalid %s metadata', async (_case, invoke) => {
    const result = await invoke();

    expect(result.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('checks permission before validation and database access', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Denied' });

    const result = await creditWallet('invalid', -1);

    expect(result).toEqual({ success: false, newBalance: 0, error: 'Denied' });
    expect(mocks.authorizePermission).toHaveBeenCalledTimes(1);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('calls the credit RPC with normalized metadata and audits only after success', async () => {
    const order: string[] = [];
    mocks.rpc.mockImplementation(async () => {
      order.push('rpc');
      return { data: { success: true, new_balance: 125, wallet_id: walletId }, error: null };
    });
    mocks.logAudit.mockImplementation(async () => void order.push('audit'));

    const result = await creditWallet(residentId, 25, ' adjustment ', referenceId, ' Correction ');

    expect(result).toEqual({ success: true, newBalance: 125, error: null });
    expect(mocks.rpc).toHaveBeenCalledWith('adjust_wallet_credit', {
      p_resident_id: residentId,
      p_amount: 25,
      p_reference_type: 'adjustment',
      p_reference_id: referenceId,
      p_description: 'Correction',
    });
    expect(order).toEqual(['rpc', 'audit']);
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      entityId: walletId,
      oldValues: { balance: 100 },
      newValues: expect.objectContaining({ balance: 125, amount_credited: 25 }),
    }));
  });

  it('calls the debit RPC and derives the prior balance for audit', async () => {
    const result = await debitWallet(residentId, 25, 'adjustment', referenceId, 'Correction');

    expect(result).toEqual({ success: true, newBalance: 125, error: null });
    expect(mocks.rpc).toHaveBeenCalledWith('adjust_wallet_debit', expect.objectContaining({ p_amount: 25 }));
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      oldValues: { balance: 150 },
      newValues: expect.objectContaining({ balance: 125, amount_debited: 25 }),
    }));
  });

  it.each([
    [{ data: null, error: { message: 'Insufficient wallet balance' } }, 'Insufficient wallet balance'],
    [{ data: { success: false }, error: null }, 'Wallet credit failed'],
  ])('does not audit or revalidate failed RPC results', async (rpcResult, error) => {
    mocks.rpc.mockResolvedValue(rpcResult);

    const result = await creditWallet(residentId, 10, 'adjustment', referenceId, 'Correction');

    expect(result).toEqual({ success: false, newBalance: 0, error });
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
