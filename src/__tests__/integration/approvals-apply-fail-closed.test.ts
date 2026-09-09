import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveRequest } from '@/actions/approvals';

const { createServerSupabaseClient, authorizePermission } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  authorizePermission: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));

vi.mock('@/lib/audit/logger', () => ({
  logAudit: vi.fn(),
}));
vi.mock('@/lib/notifications/admin-notifier', () => ({
  notifyAdmins: vi.fn(),
}));

function createQuery(result: unknown) {
  const promise = Promise.resolve(result);
  const query: Record<string, unknown> = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    then: (promise as Promise<unknown>).then.bind(promise),
  };

  (query.select as ReturnType<typeof vi.fn>).mockReturnValue(query);
  (query.update as ReturnType<typeof vi.fn>).mockReturnValue(query);
  (query.eq as ReturnType<typeof vi.fn>).mockReturnValue(query);
  (query.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);

  return query;
}

describe('applyRequestedChanges fails closed on an unhandled request_type', () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
    authorizePermission.mockReset();
    authorizePermission.mockResolvedValue({ authorized: true, userId: 'admin-1', error: null });
  });

  it('returns success: false with an explicit message and leaves status untouched', async () => {
    const fetchQuery = createQuery({
      data: {
        id: 'req-1',
        request_type: 'late_fee_waiver',
        status: 'pending',
        entity_id: 'entity-1',
        entity_type: 'billing_profile',
        requested_changes: {},
      },
      error: null,
    });
    const updateQuery = createQuery({ data: null, error: null });

    const from = vi.fn().mockReturnValueOnce(fetchQuery).mockReturnValueOnce(updateQuery);

    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('late_fee_waiver');

    // The status update to 'approved' must never be issued for an unhandled type.
    expect(updateQuery.update).not.toHaveBeenCalled();
  });

  it('still applies a handled request_type and flips status to approved', async () => {
    const fetchQuery = createQuery({
      data: {
        id: 'req-2',
        request_type: 'billing_profile_effective_date',
        status: 'pending',
        entity_id: 'profile-1',
        entity_type: 'billing_profile',
        requested_changes: { effective_date: '2026-10-01' },
      },
      error: null,
    });
    const applyQuery = createQuery({ data: null, error: null });
    const updateQuery = createQuery({ data: null, error: null });

    const from = vi
      .fn()
      .mockReturnValueOnce(fetchQuery)
      .mockReturnValueOnce(applyQuery)
      .mockReturnValueOnce(updateQuery);

    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-2');

    expect(result).toEqual({ success: true, error: null });
    expect(applyQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ effective_date: '2026-10-01' }),
    );
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
    );
  });
});
