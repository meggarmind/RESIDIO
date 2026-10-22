import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getHousePaymentStatus,
  getResidentCrossPropertyPaymentSummary,
  getResidentIndebtedness,
} from '@/actions/billing/get-invoices';

const { authorizePermission, rpc, createServerSupabaseClient, settingRows } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  rpc: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  settingRows: { current: [] as { key: string; value: unknown }[] },
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

describe('billing aggregate RPC adapters', () => {
  beforeEach(() => {
    authorizePermission.mockReset();
    rpc.mockReset();
    createServerSupabaseClient.mockReset();
    authorizePermission.mockResolvedValue({ authorized: true, error: null });
    settingRows.current = [];
    createServerSupabaseClient.mockResolvedValue({
      rpc,
      from: () => ({ select: () => ({ in: async () => ({ data: settingRows.current, error: null }) }) }),
    });
  });

  it('rejects unauthorized aggregate reads before creating a data client', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized: Missing permission' });

    await expect(getResidentIndebtedness('resident-2')).resolves.toEqual({
      data: null,
      error: 'Unauthorized: Missing permission',
    });
    await expect(getHousePaymentStatus('house-2')).resolves.toEqual({
      data: null,
      error: 'Unauthorized: Missing permission',
    });

    expect(authorizePermission).toHaveBeenCalledTimes(2);
    expect(authorizePermission).toHaveBeenNthCalledWith(1, 'billing.view');
    expect(authorizePermission).toHaveBeenNthCalledWith(2, 'billing.view');
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses the bounded resident indebtedness aggregate', async () => {
    const data = { totalUnpaid: 10, invoiceCount: 1, unpaidCount: 1, partiallyPaidCount: 0, debtStatus: 'outstanding', owedInvoiceCount: 1, walletBalance: 0 };
    rpc.mockResolvedValue({ data, error: null });

    await expect(getResidentIndebtedness('resident-1')).resolves.toEqual({
      data: { ...data, debtStatusLabel: 'Outstanding' },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('get_resident_indebtedness', { p_resident_id: 'resident-1' });
  });

  it('labels a resident with 2 owed invoices in each of two houses as arrears', async () => {
    const data = { totalUnpaid: 40, invoiceCount: 4, unpaidCount: 4, partiallyPaidCount: 0, debtStatus: 'arrears', owedInvoiceCount: 4, walletBalance: 0 };
    rpc.mockResolvedValue({ data, error: null });

    const result = await getResidentIndebtedness('resident-1');

    expect(result.data).toMatchObject({ debtStatus: 'arrears', debtStatusLabel: 'Arrears', owedInvoiceCount: 4 });
  });

  it('uses the bounded house payment aggregate', async () => {
    const data = {
      totalDue: 10, totalPaid: 5, totalOutstanding: 5, debtStatus: 'arrears', owedInvoiceCount: 4, walletBalance: 0,
      residents: [{ residentId: 'r1', debtStatus: 'credit', owedInvoiceCount: 0, walletBalance: 50 }],
    };
    rpc.mockResolvedValue({ data, error: null });
    settingRows.current = [{ key: 'debt_status_label_arrears', value: 'Seriously behind' }];

    await expect(getHousePaymentStatus('house-1')).resolves.toEqual({
      data: {
        ...data,
        debtStatusLabel: 'Seriously behind',
        residents: [{ ...data.residents[0], debtStatusLabel: 'Credit' }],
      },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('get_house_payment_status', { p_house_id: 'house-1' });
  });

  it('uses the bounded cross-property aggregate when available', async () => {
    const data = { totalDue: 10, totalPaid: 5, totalOutstanding: 5, totalInvoices: 1, properties: [] };
    rpc.mockResolvedValue({ data, error: null });

    await expect(getResidentCrossPropertyPaymentSummary('resident-1')).resolves.toEqual({ data, error: null });
    expect(rpc).toHaveBeenCalledWith('get_resident_cross_property_payment_summary', { p_resident_id: 'resident-1' });
  });

  it('adds the shared debt status to each property of the cross-property summary', async () => {
    const data = { totalInvoices: 2, properties: [{ houseId: 'h1' }, { houseId: 'h2' }] };
    rpc.mockImplementation(async (name: string) =>
      name === 'get_debt_statuses'
        ? { data: [{ house_id: 'h1', resident_id: 'resident-1', status: 'arrears', owed_invoice_count: 4, wallet_balance: 0 }], error: null }
        : { data, error: null },
    );

    const result = await getResidentCrossPropertyPaymentSummary('resident-1');

    expect(rpc).toHaveBeenCalledWith('get_debt_statuses', { p_house_ids: ['h1', 'h2'], p_resident_id: 'resident-1' });
    expect(result.data?.properties).toEqual([
      { houseId: 'h1', debtStatus: 'arrears', debtStatusLabel: 'Arrears', owedInvoiceCount: 4, walletBalance: 0 },
      { houseId: 'h2', debtStatus: 'paid_in_full', debtStatusLabel: 'Paid in Full', owedInvoiceCount: 0, walletBalance: 0 },
    ]);
  });

  it('does not fall back to an unbounded invoice read when the aggregate fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'aggregate unavailable' } });

    await expect(getResidentCrossPropertyPaymentSummary('resident-1')).resolves.toEqual({
      data: null,
      error: 'aggregate unavailable',
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
