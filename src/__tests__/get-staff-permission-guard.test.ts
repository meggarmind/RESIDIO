/**
 * Issue #211 -- getStaff() had no authorization check, so any signed-in session
 * could list the super_admin/chairman profiles. It is now gated on
 * EXPENDITURE_VIEW (the permission ROUTE_PERMISSIONS applies to /expenditure,
 * the only page that uses it) and fails closed with [] before any query.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStaff } from '@/actions/settings/get-staff';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { authorizePermission, createServerSupabaseClient, order } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  order: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

beforeEach(() => {
  vi.clearAllMocks();
  const chain = { select: vi.fn(), in: vi.fn(), order };
  chain.select.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  createServerSupabaseClient.mockResolvedValue({ from: vi.fn().mockReturnValue(chain) });
});

describe('getStaff permission guard (#211)', () => {
  it('returns no staff and never queries Supabase when unauthorized', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });
    await expect(getStaff()).resolves.toEqual([]);
    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.EXPENDITURE_VIEW);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
    expect(order).not.toHaveBeenCalled();
  });

  it('returns mapped rows when authorized', async () => {
    authorizePermission.mockResolvedValue({ authorized: true });
    order.mockResolvedValue({
      data: [
        { id: '1', full_name: 'A', email: 'a@x.test', role_id: 'r1', app_roles: { name: 'super_admin' } },
        { id: '2', full_name: 'B', email: 'b@x.test', role_id: 'r2', app_roles: [{ name: 'chairman' }] },
      ],
      error: null,
    });
    const rows = await getStaff();
    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.EXPENDITURE_VIEW);
    expect(rows.map((r) => [r.id, r.role])).toEqual([['1', 'super_admin'], ['2', 'chairman']]);
  });
});
