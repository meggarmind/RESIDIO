import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBillingResidentFilterOptions,
  getHousePaymentStatus,
  getInvoiceById,
  getInvoices,
  getResidentCrossPropertyPaymentSummary,
  getResidentIndebtedness,
} from '@/actions/billing/get-invoices';
import { getResidents } from '@/actions/residents/get-residents';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { authorizePermission, createAdminClient, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createAdminClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient, createServerSupabaseClient }));

describe('billing query authorization', () => {
  beforeEach(() => {
    authorizePermission.mockReset();
    createAdminClient.mockReset();
    createServerSupabaseClient.mockReset();
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized: Missing permission' });
  });

  it('rejects invoice list filters before creating a data client', async () => {
    await expect(getInvoices({ residentId: 'resident-2' })).resolves.toEqual({
      data: [],
      total: 0,
      error: 'Unauthorized: Missing permission',
    });

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_VIEW);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('rejects invoice detail reads before creating a data client', async () => {
    await expect(getInvoiceById('invoice-2')).resolves.toEqual({
      data: null,
      error: 'Unauthorized: Missing permission',
    });

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_VIEW);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it.each([
    ['resident filter options', () => getBillingResidentFilterOptions()],
    ['resident indebtedness', () => getResidentIndebtedness('resident-2')],
    ['house payment status', () => getHousePaymentStatus('house-2')],
    ['cross-property payment summary', () => getResidentCrossPropertyPaymentSummary('resident-2')],
  ])('rejects %s before creating a data client', async (_, query) => {
    await expect(query()).resolves.toEqual({
      data: null,
      error: 'Unauthorized: Missing permission',
    });

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_VIEW);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('rejects resident lookups before creating a data client', async () => {
    await expect(getResidents({ house_id: 'house-2' })).resolves.toEqual({
      data: [],
      count: 0,
      error: 'Unauthorized: Missing permission',
    });

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.RESIDENTS_VIEW);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
