import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { removeOwnership } from '../remove-ownership';
import { PERMISSIONS } from '@/lib/auth/action-roles';

// Owner decision 2026-10-20 (#784): Remove ownership, like Transfer, needs houses.update.
describe('removeOwnership permission', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checks houses.update and stops before any database access when it is refused', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });

    const result = await removeOwnership('house-1', 'owner-1');

    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.HOUSES_UPDATE);
    expect(mocks.authorizePermission).not.toHaveBeenCalledWith(PERMISSIONS.HOUSES_ASSIGN_RESIDENT);
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
