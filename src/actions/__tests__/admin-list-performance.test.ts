import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getResidents } from '@/actions/residents/get-residents';
import { getInvoices } from '@/actions/billing/get-invoices';

const { authorizePermission, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

function createQuery(result: Record<string, unknown>) {
  const query = {
    select: vi.fn(),
    from: vi.fn(),
    or: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    range: vi.fn(),
    order: vi.fn(),
    then: vi.fn((resolve: (value: Record<string, unknown>) => unknown) => resolve(result)),
  };

  for (const method of ['select', 'from', 'or', 'eq', 'in', 'is', 'not', 'range', 'order'] as const) {
    query[method].mockReturnValue(query);
  }

  return query;
}

describe('admin list query performance contracts', () => {
  beforeEach(() => {
    authorizePermission.mockReset();
    createServerSupabaseClient.mockReset();
    authorizePermission.mockResolvedValue({ authorized: true, error: null });
  });

  it('uses an explicit resident projection while preserving filtered count and page bounds', async () => {
    const query = createQuery({ data: [], count: 41, error: null });
    createServerSupabaseClient.mockResolvedValue({ from: vi.fn(() => query) });

    await expect(getResidents({ page: 3, limit: 10, status: 'active' })).resolves.toEqual({
      data: [],
      count: 41,
      error: null,
    });

    const projection = query.select.mock.calls[0][0] as string;
    expect(projection).not.toContain('*');
    expect(projection).toContain('id, resident_code, first_name, last_name');
    expect(projection).toContain('resident_houses!resident_id');
    expect(query.select).toHaveBeenCalledWith(expect.any(String), { count: 'exact' });
    expect(query.range).toHaveBeenCalledWith(20, 29);
  });

  it('applies contact verification filters before pagination so the exact count is filtered', async () => {
    const query = createQuery({ data: [], count: 6, error: null });
    createServerSupabaseClient.mockResolvedValue({ from: vi.fn(() => query) });

    await expect(getResidents({ page: 2, limit: 5, contact_verification: 'verified' })).resolves.toEqual({
      data: [],
      count: 6,
      error: null,
    });

    expect(query.or).toHaveBeenCalledWith('email.is.null,email_verified_at.not.is.null');
    expect(query.not).toHaveBeenCalledWith('phone_verified_at', 'is', null);
    expect(query.range).toHaveBeenCalledWith(5, 9);
  });

  it('uses an explicit invoice list projection while preserving filtered count and page bounds', async () => {
    const query = createQuery({ data: [], count: 27, error: null });
    createServerSupabaseClient.mockResolvedValue({ from: vi.fn(() => query) });

    await expect(getInvoices({ page: 2, limit: 10, status: 'unpaid' })).resolves.toEqual({
      data: [],
      total: 27,
      error: null,
    });

    const projection = query.select.mock.calls[0][0] as string;
    expect(projection).not.toContain('*');
    expect(projection).toContain('id, invoice_number, resident_id, house_id');
    expect(projection).toContain('invoice_items(id, description, amount)');
    expect(query.select).toHaveBeenCalledWith(expect.any(String), { count: 'exact' });
    expect(query.range).toHaveBeenCalledWith(10, 19);
  });
});
