/** #1190: re-tagging a payment needs billing.manage_wallets, runs the atomic RPC and is audited. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  rpc: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { retagPaymentCategory } from '@/actions/payments/retag-payment';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const PAYMENT = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.rpc.mockResolvedValue({
    data: {
      success: true,
      amount: 5000,
      old_charge_category: 'dues',
      new_charge_category: 'development_levy',
      old_wallet_id: 'w-dues',
      old_wallet_balance: 0,
      new_wallet_id: 'w-levy',
      new_wallet_balance: 5000,
    },
    error: null,
  });
});

describe('retagPaymentCategory', () => {
  it('moves the payment through the RPC and audits old and new category', async () => {
    expect(await retagPaymentCategory(PAYMENT, 'development_levy')).toEqual({ success: true, error: null });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_MANAGE_WALLETS);
    expect(mocks.rpc).toHaveBeenCalledWith('retag_payment_charge_category', { p_payment_id: PAYMENT, p_charge_category: 'development_levy' });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE',
      entityType: 'payments',
      entityId: PAYMENT,
      oldValues: expect.objectContaining({ charge_category: 'dues' }),
      newValues: expect.objectContaining({ charge_category: 'development_levy', amount_moved: 5000 }),
    }));
  });

  it('refuses without the permission, before touching the database', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });
    expect(await retagPaymentCategory(PAYMENT, 'development_levy')).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('returns the RPC refusal and writes no audit row', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'This payment has already paid invoices' } });
    expect(await retagPaymentCategory(PAYMENT, 'development_levy')).toEqual({ success: false, error: 'This payment has already paid invoices' });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('rejects a malformed payment id or category', async () => {
    expect((await retagPaymentCategory('nope', 'dues')).error).toBe('Invalid payment');
    expect((await retagPaymentCategory(PAYMENT, 'Dues!')).error).toBe('Invalid charge category');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
