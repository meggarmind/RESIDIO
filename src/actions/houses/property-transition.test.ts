import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { executeDeveloperToOwner, executeLandlordToTenant } from '@/actions/houses/property-transition';

const houseId = '11111111-1111-4111-8111-111111111111';
const residentId = '22222222-2222-4222-8222-222222222222';
const requestKey = 'transition:house-1:owner-1';

describe('property transition actions', () => {
  const rpc = vi.fn();
  const getUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: '33333333-3333-4333-8333-333333333333' });
    getUser.mockResolvedValue({ data: { user: { id: '33333333-3333-4333-8333-333333333333' } } });
    mocks.createServerSupabaseClient.mockResolvedValue({ rpc, auth: { getUser } });
    mocks.logAudit.mockResolvedValue(undefined);
  });

  it('denies before opening a database client', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Denied' });

    await expect(executeDeveloperToOwner(
      houseId,
      residentId,
      'resident_landlord',
      [],
      requestKey,
    )).resolves.toEqual({ success: false, error: 'Denied' });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('delegates the complete transition to one atomic RPC and audits success', async () => {
    rpc.mockResolvedValue({
      data: { success: true, stats: { staff_removed: 1, staff_transferred: 1, staff_extended: 0 } },
      error: null,
    });

    const result = await executeDeveloperToOwner(
      houseId,
      residentId,
      'resident_landlord',
      [
        { assignment_id: '44444444-4444-4444-8444-444444444444', action: 'remove' },
        { assignment_id: '55555555-5555-4555-8555-555555555555', action: 'transfer', new_sponsor_id: residentId },
      ],
      requestKey,
      '2026-08-24',
    );

    expect(result).toEqual({
      success: true,
      error: null,
      stats: { staff_removed: 1, staff_transferred: 1, staff_extended: 0 },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('execute_property_transition', expect.objectContaining({
      p_request_key: requestKey,
      p_transition_type: 'developer_to_owner',
      p_staff_actions: expect.any(Array),
    }));
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });

  it('does not audit or revalidate after a rollback', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'One or more staff assignments are unavailable' } });

    await expect(executeLandlordToTenant(
      houseId,
      residentId,
      [],
      requestKey,
    )).resolves.toEqual({ success: false, error: 'One or more staff assignments are unavailable' });
    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('returns the same successful boundary for an idempotent retry', async () => {
    rpc.mockResolvedValue({
      data: { success: true, existing: true, stats: { staff_removed: 0, staff_transferred: 0, staff_extended: 0 } },
      error: null,
    });

    const result = await executeLandlordToTenant(houseId, residentId, [], requestKey);

    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});
