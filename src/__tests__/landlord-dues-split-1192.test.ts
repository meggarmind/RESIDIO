/**
 * #1192 "Split to tenants": one landlord payment in the landlord's Dues wallet pays the dues of the
 * tenants of four flats (IBB 226 F1 to F4). Each share is a Transfer credit (#1191) that settles the
 * tenant's invoices in that flat; the split writes its own audit row and sends the receipts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  transferWalletCredit: vi.fn(),
  sendLandlordDuesReceipts: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn(async () => mocks.client) }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/actions/billing/wallet-transfers', () => ({ transferWalletCredit: mocks.transferWalletCredit }));
vi.mock('@/lib/billing/landlord-dues-receipts', () => ({ sendLandlordDuesReceipts: mocks.sendLandlordDuesReceipts }));

import { getLandlordDuesSplit, splitLandlordDues } from '@/actions/billing/landlord-dues-split';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const id = (n: number, prefix: string) => `00000000-0000-4000-8000-${prefix}${String(n).padStart(12 - prefix.length, '0')}`;
const LANDLORD = { id: id(9, 'a'), first_name: 'Lola', last_name: 'Landlord', email: 'lola@example.test', phone_primary: null };
const FLATS = [1, 2, 3, 4];
const tenant = (n: number) => ({ id: id(n, 'b'), first_name: 'Tenant', last_name: `F${n}`, email: `t${n}@example.test`, phone_primary: null });
const house = (n: number) => ({ id: id(n, 'c'), house_number: '226', short_name: `IBB 226 F${n}`, dues_paid_by_landlord: true, street: { name: 'IBB Way' } });

const LINKS = FLATS.flatMap((n) => [
  { house_id: id(n, 'c'), resident_role: 'non_resident_landlord', resident: LANDLORD, house: house(n) },
  { house_id: id(n, 'c'), resident_role: 'tenant', resident: tenant(n), house: house(n) },
]);
// Each tenant owes Sep and Oct 2026 dues of 25,000 each.
const INVOICES = FLATS.flatMap((n) => ['2026-09-01', '2026-10-01'].map((period) => ({
  house_id: id(n, 'c'),
  resident_id: id(n, 'b'),
  period_start: period,
  amount_due: 25000,
  amount_paid: 0,
  resident: tenant(n),
})));

function client(walletBalance: number) {
  const rows: Record<string, unknown> = { resident_houses: LINKS, invoices: INVOICES };
  return {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'in', 'eq', 'neq', 'lte', 'order']) chain[m] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: id(1, 'd'), balance: walletBalance }, error: null }));
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve);
      return chain;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client = client(200000);
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'admin' });
  mocks.transferWalletCredit.mockResolvedValue({ success: true, error: null, transferId: 'tr', totalSettled: 50000, settlementError: null });
  mocks.sendLandlordDuesReceipts.mockResolvedValue({ sent: 5, errors: [] });
});

describe('getLandlordDuesSplit (#1192)', () => {
  it('lists each flagged flat with what its tenant owes and the landlord Dues wallet', async () => {
    const { data, error } = await getLandlordDuesSplit(id(1, 'c'));
    expect(error).toBeNull();
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_TRANSFER_WALLET_CREDIT);
    expect(data?.landlord).toEqual({ id: LANDLORD.id, name: 'Lola Landlord' });
    expect(data?.walletBalance).toBe(200000);
    expect(data?.flats).toEqual(FLATS.map((n) => ({
      houseId: id(n, 'c'), houseLabel: `IBB 226 F${n}`, tenantId: id(n, 'b'), tenantName: `Tenant F${n}`, owed: 50000,
    })));
  });

  it('refuses without billing.transfer_wallet_credit', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });
    expect(await getLandlordDuesSplit(id(1, 'c'))).toEqual({ data: null, error: 'Forbidden' });
  });
});

describe('splitLandlordDues (#1192)', () => {
  const allocations = FLATS.map((n) => ({ houseId: id(n, 'c'), tenantId: id(n, 'b'), amount: 50000 }));

  it('transfers each flat share to its tenant, settles in that flat, audits and sends receipts', async () => {
    const result = await splitLandlordDues({ houseId: id(1, 'c'), allocations });

    expect(result.error).toBeNull();
    expect(mocks.transferWalletCredit).toHaveBeenCalledTimes(4);
    for (const n of FLATS) {
      expect(mocks.transferWalletCredit).toHaveBeenCalledWith({
        fromWalletId: id(1, 'd'),
        toResidentId: id(n, 'b'),
        toChargeCategory: 'dues',
        amount: 50000,
        reason: `Dues paid by landlord for IBB 226 F${n}`,
        houseId: id(n, 'c'),
      });
    }
    expect(result.results.every((r) => r.success && r.totalSettled === 50000)).toBe(true);
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ALLOCATE',
      entityType: 'wallets',
      entityId: id(1, 'd'),
      newValues: expect.objectContaining({ landlord_id: LANDLORD.id, total: 200000 }),
    }));
    const receipts = mocks.sendLandlordDuesReceipts.mock.calls[0][0];
    expect(receipts.landlord.id).toBe(LANDLORD.id);
    expect(receipts.tenants).toEqual(FLATS.map((n) => ({
      tenant: tenant(n), flat: `IBB 226 F${n}`, amount: 50000, months: ['Sep 2026', 'Oct 2026'],
    })));
  });

  it('a part payment lists only the months it reaches', async () => {
    await splitLandlordDues({ houseId: id(1, 'c'), allocations: [{ houseId: id(1, 'c'), tenantId: id(1, 'b'), amount: 20000 }] });
    expect(mocks.sendLandlordDuesReceipts.mock.calls[0][0].tenants[0].months).toEqual(['Sep 2026']);
  });

  it('refuses a split above the landlord Dues wallet balance, before any transfer', async () => {
    mocks.client = client(150000);
    const result = await splitLandlordDues({ houseId: id(1, 'c'), allocations });
    expect(result.error).toBe('The split is more than the landlord\'s Dues wallet balance');
    expect(mocks.transferWalletCredit).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('refuses a tenant who owes no dues in the landlord flats', async () => {
    const result = await splitLandlordDues({
      houseId: id(1, 'c'),
      allocations: [{ houseId: id(1, 'c'), tenantId: id(2, 'b'), amount: 1000 }],
    });
    expect(result.error).toMatch(/Each tenant must owe dues/);
    expect(mocks.transferWalletCredit).not.toHaveBeenCalled();
  });

  it('reports a failed transfer and sends no receipt for that flat', async () => {
    mocks.transferWalletCredit
      .mockResolvedValueOnce({ success: true, error: null, totalSettled: 50000, settlementError: null })
      .mockResolvedValueOnce({ success: false, error: 'Transfer amount is more than the source wallet balance' });
    const result = await splitLandlordDues({ houseId: id(1, 'c'), allocations: allocations.slice(0, 2) });
    expect(result.results.map((r) => r.success)).toEqual([true, false]);
    expect(mocks.sendLandlordDuesReceipts.mock.calls[0][0].tenants).toHaveLength(1);
  });

  it('refuses without billing.transfer_wallet_credit', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });
    const result = await splitLandlordDues({ houseId: id(1, 'c'), allocations });
    expect(result.error).toBe('Forbidden');
    expect(mocks.transferWalletCredit).not.toHaveBeenCalled();
  });
});
