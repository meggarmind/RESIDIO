import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveRequest } from '@/actions/approvals';

const { createServerSupabaseClient, authorizePermission, logAudit } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));

vi.mock('@/lib/audit/logger', () => ({
  logAudit,
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
    maybeSingle: vi.fn(),
    then: (promise as Promise<unknown>).then.bind(promise),
  };

  (query.select as ReturnType<typeof vi.fn>).mockReturnValue(query);
  (query.update as ReturnType<typeof vi.fn>).mockReturnValue(query);
  (query.eq as ReturnType<typeof vi.fn>).mockReturnValue(query);
  (query.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);
  (query.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue(result);

  return query;
}

describe('applyRequestedChanges fails closed on an unhandled request_type', () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
    authorizePermission.mockReset();
    logAudit.mockReset();
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
    // The request is claimed (pending -> approved) before changes are applied, so an
    // unhandled type is claimed, fails to apply, and the claim is released again.
    const claimQuery = createQuery({ data: { id: 'req-1' }, error: null });
    const releaseQuery = createQuery({ data: null, error: null });

    const from = vi
      .fn()
      .mockReturnValueOnce(fetchQuery)
      .mockReturnValueOnce(claimQuery)
      .mockReturnValueOnce(releaseQuery);

    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('late_fee_waiver');

    // The claim must be released back to pending, and success never audited.
    expect(releaseQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(releaseQuery.eq).toHaveBeenCalledWith('status', 'approved');
    expect(logAudit).not.toHaveBeenCalled();
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
    const updateQuery = createQuery({ data: { id: 'req-2' }, error: null });
    // The handler reads the entity before writing it (#555).
    const preReadQuery = createQuery({
      data: { name: 'Profile 1', effective_date: '2026-01-01' },
      error: null,
    });
    const applyQuery = createQuery({ data: null, error: null });
    const appliedAtQuery = createQuery({ data: null, error: null }); // applied_at update (#557)

    const from = vi
      .fn()
      .mockReturnValueOnce(fetchQuery)
      .mockReturnValueOnce(updateQuery)
      .mockReturnValueOnce(preReadQuery)
      .mockReturnValueOnce(applyQuery)
      .mockReturnValueOnce(appliedAtQuery);

    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-2');

    expect(result).toEqual({ success: true, error: null });
    expect(applyQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ effective_date: '2026-10-01' }),
    );
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
    );
    // The entity UPDATE audit is written first (#555), then the APPROVE audit.
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'APPROVE',
      entityType: 'approval_requests',
      entityId: 'req-2',
      newValues: expect.objectContaining({ status: 'approved' }),
    }));
  });
});
