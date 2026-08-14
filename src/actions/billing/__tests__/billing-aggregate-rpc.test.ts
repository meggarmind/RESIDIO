import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getHousePaymentStatus,
  getResidentCrossPropertyPaymentSummary,
  getResidentIndebtedness,
} from '@/actions/billing/get-invoices';

const { rpc, createServerSupabaseClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

describe('billing aggregate RPC adapters', () => {
  beforeEach(() => {
    rpc.mockReset();
    createServerSupabaseClient.mockResolvedValue({ rpc });
  });

  it('uses the bounded resident indebtedness aggregate', async () => {
    const data = { totalUnpaid: 10, invoiceCount: 1, unpaidCount: 1, partiallyPaidCount: 0 };
    rpc.mockResolvedValue({ data, error: null });

    await expect(getResidentIndebtedness('resident-1')).resolves.toEqual({ data, error: null });
    expect(rpc).toHaveBeenCalledWith('get_resident_indebtedness', { p_resident_id: 'resident-1' });
  });

  it('uses the bounded house payment aggregate', async () => {
    const data = { totalDue: 10, totalPaid: 5, totalOutstanding: 5, residents: [] };
    rpc.mockResolvedValue({ data, error: null });

    await expect(getHousePaymentStatus('house-1')).resolves.toEqual({ data, error: null });
    expect(rpc).toHaveBeenCalledWith('get_house_payment_status', { p_house_id: 'house-1' });
  });

  it('uses the bounded cross-property aggregate when available', async () => {
    const data = { totalDue: 10, totalPaid: 5, totalOutstanding: 5, totalInvoices: 1, properties: [] };
    rpc.mockResolvedValue({ data, error: null });

    await expect(getResidentCrossPropertyPaymentSummary('resident-1')).resolves.toEqual({ data, error: null });
    expect(rpc).toHaveBeenCalledWith('get_resident_cross_property_payment_summary', { p_resident_id: 'resident-1' });
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
