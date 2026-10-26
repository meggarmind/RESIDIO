import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  getOrCreateWallet: vi.fn(),
  rpc: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  calls: [] as Array<[string, string, unknown[]]>,
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/actions/billing/wallet', () => ({ getOrCreateWallet: mocks.getOrCreateWallet }));

import { getWalletTransferTargets, reverseWalletTransfer, transferWalletCredit } from '@/actions/billing/wallet-transfers';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const fromWalletId = '11111111-1111-4111-8111-111111111111';
const toWalletId = '22222222-2222-4222-8222-222222222222';
const landlordId = '33333333-3333-4333-8333-333333333333';
const tenantId = '44444444-4444-4444-8444-444444444444';
const houseId = '55555555-5555-4555-8555-555555555555';
const transferId = '66666666-6666-4666-8666-666666666666';
const invoiceId = '77777777-7777-4777-8777-777777777777';
const actorId = '88888888-8888-4888-8888-888888888888';

/** A query builder that records each call and resolves to the table's configured result. */
function from(table: string) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      mocks.calls.push([table, method, args]);
      return builder;
    };
  }
  builder.maybeSingle = async () => mocks.tables[table];
  builder.then = (resolve: (value: unknown) => unknown) => resolve(mocks.tables[table]);
  return builder;
}

const transferInput = {
  fromWalletId,
  toResidentId: tenantId,
  toChargeCategory: 'dues',
  amount: 2000,
  reason: ' Landlord pays tenant dues ',
  houseId,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.tables = {
    resident_houses: { data: { id: 'link' }, error: null },
    invoices: { data: [{ id: invoiceId }], error: null },
  };
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: actorId });
  mocks.createServerSupabaseClient.mockResolvedValue({ rpc: mocks.rpc, from });
  mocks.getOrCreateWallet.mockResolvedValue({ data: { id: toWalletId }, error: null });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'transfer_wallet_credit') {
      return {
        data: {
          success: true,
          transfer_id: transferId,
          from_resident_id: landlordId,
          from_charge_category: 'dues',
          from_balance: 500,
          to_balance: 2000,
        },
        error: null,
      };
    }
    if (name === 'settle_wallet_invoices') {
      return { data: { success: true, batch_id: 'batch-1', receipt_number: 'R-1', total_allocated: 1500 }, error: null };
    }
    if (name === 'reverse_wallet_transfer') {
      return {
        data: {
          success: true,
          amount: 2000,
          transfer_description: 'Transfer to Dues wallet of T: x',
          from_wallet_id: fromWalletId,
          from_resident_id: landlordId,
          from_balance: 2500,
          to_wallet_id: toWalletId,
          to_resident_id: tenantId,
          to_balance: 0,
        },
        error: null,
      };
    }
    throw new Error(`unexpected rpc ${name}`);
  });
});

describe('getWalletTransferTargets', () => {
  it('checks billing.transfer_wallet_credit', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Denied' });

    expect(await getWalletTransferTargets(landlordId)).toEqual({ data: null, error: 'Denied' });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_TRANSFER_WALLET_CREDIT);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('lists each active house with its actively linked residents', async () => {
    let call = 0;
    mocks.createServerSupabaseClient.mockResolvedValue({
      from: (table: string) => {
        call++;
        mocks.tables[table] = call === 1
          ? { data: [{ house_id: houseId, house: { house_number: '12', short_name: null, street: { name: 'Palm Close' } } }], error: null }
          : {
              data: [
                { house_id: houseId, resident: { id: landlordId, first_name: 'Mr', last_name: 'A' } },
                { house_id: houseId, resident: { id: tenantId, first_name: 'Ms', last_name: 'T' } },
              ],
              error: null,
            };
        return from(table);
      },
    });

    expect(await getWalletTransferTargets(landlordId)).toEqual({
      data: [{ houseId, houseLabel: '12, Palm Close', residents: [{ id: landlordId, name: 'Mr A' }, { id: tenantId, name: 'Ms T' }] }],
      error: null,
    });
    expect(mocks.calls).toEqual(expect.arrayContaining([
      ['resident_houses', 'eq', ['resident_id', landlordId]],
      ['resident_houses', 'eq', ['is_active', true]],
    ]));
  });
});

describe('transferWalletCredit', () => {
  it('checks billing.transfer_wallet_credit before anything else', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Denied' });

    expect(await transferWalletCredit(transferInput)).toEqual({ success: false, error: 'Denied' });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_TRANSFER_WALLET_CREDIT);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it.each([
    ['empty reason', { reason: '  ' }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -5 }],
    ['infinite amount', { amount: Number.POSITIVE_INFINITY }],
    ['bad wallet id', { fromWalletId: 'wallet' }],
    ['bad category', { toChargeCategory: 'Dues!' }],
  ])('refuses %s before database access', async (_case, patch) => {
    const result = await transferWalletCredit({ ...transferInput, ...patch });

    expect(result.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('refuses a house the receiving resident is not linked to', async () => {
    mocks.tables.resident_houses = { data: null, error: null };

    const result = await transferWalletCredit(transferInput);

    expect(result).toEqual({ success: false, error: 'The receiving resident is not linked to that house' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('transfers with the trimmed reason, audits it, then settles the receiving wallet in that house', async () => {
    const result = await transferWalletCredit(transferInput);

    expect(result).toEqual({ success: true, error: null, transferId, totalSettled: 1500, settlementError: null });
    expect(mocks.getOrCreateWallet).toHaveBeenCalledWith(tenantId, 'dues');
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'transfer_wallet_credit', {
      p_from_wallet: fromWalletId,
      p_to_wallet: toWalletId,
      p_amount: 2000,
      p_reason: 'Landlord pays tenant dues',
    });
    expect(mocks.logAudit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: 'UPDATE',
      entityType: 'wallets',
      entityId: fromWalletId,
      newValues: expect.objectContaining({ transfer_id: transferId, amount: 2000, reason: 'Landlord pays tenant dues', to_wallet_id: toWalletId }),
    }));

    // Settlement: the receiving resident's invoices of that category, in that house only.
    expect(mocks.calls).toEqual(expect.arrayContaining([
      ['invoices', 'eq', ['resident_id', tenantId]],
      ['invoices', 'eq', ['house_id', houseId]],
      ['invoices', 'eq', ['charge_category', 'dues']],
    ]));
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'settle_wallet_invoices', expect.objectContaining({
      p_resident_id: tenantId,
      p_invoice_ids: [invoiceId],
      p_batch_type: 'existing_wallet_settlement',
      p_house_id: houseId,
      p_charge_category: 'dues',
      p_created_by: actorId,
    }));
    expect(mocks.logAudit).toHaveBeenNthCalledWith(2, expect.objectContaining({ action: 'ALLOCATE', entityId: 'batch-1' }));
  });

  it('does not settle when no house is given or no invoice is due', async () => {
    await transferWalletCredit({ ...transferInput, houseId: null });
    mocks.tables.invoices = { data: [], error: null };
    await transferWalletCredit(transferInput);

    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['transfer_wallet_credit', 'transfer_wallet_credit']);
  });

  it('returns the RPC refusal and writes no audit row', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Credit can only be transferred to a resident linked to the same house' } });

    const result = await transferWalletCredit(transferInput);

    expect(result).toEqual({ success: false, error: 'Credit can only be transferred to a resident linked to the same house' });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('keeps the transfer and reports a settlement failure', async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'transfer_wallet_credit'
        ? { data: { success: true, transfer_id: transferId, from_resident_id: landlordId, from_balance: 0, to_balance: 2000 }, error: null }
        : { data: null, error: { message: 'permission denied for table invoices' } });

    const result = await transferWalletCredit(transferInput);

    expect(result).toEqual(expect.objectContaining({ success: true, transferId, settlementError: 'permission denied for table invoices' }));
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });
});

describe('reverseWalletTransfer', () => {
  it('checks billing.transfer_wallet_credit and requires a reason', async () => {
    mocks.authorizePermission.mockResolvedValueOnce({ authorized: false, error: 'Denied' });
    expect(await reverseWalletTransfer({ transferId, reason: 'x' })).toEqual({ success: false, error: 'Denied' });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_TRANSFER_WALLET_CREDIT);

    expect((await reverseWalletTransfer({ transferId, reason: ' ' })).success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('reverses and audits the reason', async () => {
    const result = await reverseWalletTransfer({ transferId, reason: ' Entered in error ' });

    expect(result).toEqual({ success: true, error: null });
    expect(mocks.rpc).toHaveBeenCalledWith('reverse_wallet_transfer', { p_transfer_id: transferId, p_reason: 'Entered in error' });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE',
      entityType: 'wallets',
      entityId: fromWalletId,
      newValues: expect.objectContaining({ transfer_id: transferId, reversed: true, reason: 'Entered in error', amount: 2000 }),
    }));
  });

  it('returns the RPC refusal and writes no audit row', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'The receiving wallet no longer holds the transferred amount' } });

    expect(await reverseWalletTransfer({ transferId, reason: 'x' })).toEqual({
      success: false,
      error: 'The receiving wallet no longer holds the transferred amount',
    });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});
