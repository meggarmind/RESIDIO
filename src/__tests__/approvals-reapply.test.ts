import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveRequest, reapplyApprovedRequest } from '@/actions/approvals';

const { createServerSupabaseClient, authorizePermission, logAudit } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));

/** Chainable query double (mirrors maker-checker-guards.test.ts, plus `is`). */
function createQuery(result: unknown) {
  const promise = Promise.resolve(result);
  const query: Record<string, unknown> = {
    then: (promise as Promise<unknown>).then.bind(promise),
  };
  for (const m of ['select', 'update', 'eq', 'is']) {
    query[m] = vi.fn().mockReturnValue(query);
  }
  query.single = vi.fn().mockResolvedValue(result);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  return query as Record<string, ReturnType<typeof vi.fn>>;
}

beforeEach(() => {
  createServerSupabaseClient.mockReset();
  authorizePermission.mockReset();
  logAudit.mockReset();
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'approver-1', error: null });
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const requestRow = (over: Record<string, unknown> = {}) => ({
  id: 'req-1',
  request_type: 'billing_profile_effective_date',
  status: 'pending',
  requested_by: 'maker-1',
  entity_id: 'profile-1',
  entity_type: 'billing_profile',
  requested_changes: { effective_date: '2026-10-01' },
  reviewed_at: null,
  applied_at: null,
  ...over,
});

const stuckRow = (over: Record<string, unknown> = {}) =>
  requestRow({ status: 'approved', reviewed_at: minutesAgo(30), ...over });

const preRead = () =>
  createQuery({ data: { name: 'Profile 1', effective_date: '2026-01-01' }, error: null });

describe('approveRequest records applied_at (#557)', () => {
  it('sets applied_at after the apply succeeds, guarded on approved, before the APPROVE audit', async () => {
    const fetchQ = createQuery({ data: requestRow(), error: null });
    const claimQ = createQuery({ data: { id: 'req-1' }, error: null });
    const applyQ = createQuery({ data: null, error: null });
    const appliedQ = createQuery({ data: null, error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(fetchQ)
      .mockReturnValueOnce(claimQ)
      .mockReturnValueOnce(preRead())
      .mockReturnValueOnce(applyQ)
      .mockReturnValueOnce(appliedQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result).toEqual({ success: true, error: null });
    expect(from).toHaveBeenCalledTimes(5);
    expect(appliedQ.update).toHaveBeenCalledWith(
      expect.objectContaining({ applied_at: expect.any(String) }),
    );
    expect(appliedQ.eq).toHaveBeenCalledWith('id', 'req-1');
    expect(appliedQ.eq).toHaveBeenCalledWith('status', 'approved');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }));
  });

  it('still succeeds, logging the error object, when the applied_at update fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchQ = createQuery({ data: requestRow(), error: null });
    const claimQ = createQuery({ data: { id: 'req-1' }, error: null });
    const appliedQ = createQuery({ data: null, error: { message: 'applied_at boom' } });
    const from = vi
      .fn()
      .mockReturnValueOnce(fetchQ)
      .mockReturnValueOnce(claimQ)
      .mockReturnValueOnce(preRead())
      .mockReturnValueOnce(createQuery({ data: null, error: null }))
      .mockReturnValueOnce(appliedQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result).toEqual({ success: true, error: null });
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('applied_at'),
      expect.objectContaining({ message: 'applied_at boom' }),
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }));
    errSpy.mockRestore();
  });
});

describe('reapplyApprovedRequest (#557)', () => {
  it('refuses an unauthorized caller before touching anything else', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, userId: null, error: 'Nope' });
    const from = vi.fn();
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result).toEqual({ success: false, error: 'Nope' });
    expect(authorizePermission).toHaveBeenCalledWith('approvals.approve_reject');
    expect(from).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('reports a missing request', async () => {
    const from = vi.fn().mockReturnValueOnce(createQuery({ data: null, error: { message: 'x' } }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result).toEqual({ success: false, error: 'Request not found' });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it.each(['pending', 'rejected'])('refuses a %s request', async (status) => {
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: stuckRow({ status }), error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result).toEqual({ success: false, error: 'Only an approved request can be re-applied' });
    expect(from).toHaveBeenCalledTimes(1);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses a request that was already applied', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        createQuery({ data: stuckRow({ applied_at: minutesAgo(20) }), error: null }),
      );
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result).toEqual({ success: false, error: 'This request has already been applied' });
    expect(from).toHaveBeenCalledTimes(1);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses an approval that is too recent to be stuck', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        createQuery({ data: stuckRow({ reviewed_at: minutesAgo(1) }), error: null }),
      );
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result).toEqual({
      success: false,
      error: 'This approval is still being applied; try again in a few minutes',
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('applies via the registry, sets applied_at under a null guard and writes one UPDATE audit', async () => {
    const fetchQ = createQuery({ data: stuckRow(), error: null });
    const entityUpdateQ = createQuery({ data: null, error: null });
    const markQ = createQuery({ data: { id: 'req-1' }, error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(fetchQ)
      .mockReturnValueOnce(preRead())
      .mockReturnValueOnce(entityUpdateQ)
      .mockReturnValueOnce(markQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result).toEqual({ success: true, error: null });
    expect(from.mock.calls.map((c) => c[0])).toEqual([
      'approval_requests',
      'billing_profiles',
      'billing_profiles',
      'approval_requests',
    ]);
    expect(entityUpdateQ.update).toHaveBeenCalledWith(
      expect.objectContaining({ effective_date: '2026-10-01' }),
    );
    expect(markQ.update).toHaveBeenCalledWith(
      expect.objectContaining({ applied_at: expect.any(String) }),
    );
    expect(markQ.is).toHaveBeenCalledWith('applied_at', null);
    expect(markQ.eq).toHaveBeenCalledWith('status', 'approved');

    // entity audit from the registry + exactly one audit on the approval request
    const approvalAudits = logAudit.mock.calls.filter(
      ([a]) => a.entityType === 'approval_requests',
    );
    expect(approvalAudits).toHaveLength(1);
    expect(approvalAudits[0][0]).toEqual(
      expect.objectContaining({
        action: 'UPDATE',
        entityId: 'req-1',
        description: 'Re-applied an approved request that had not been applied',
        oldValues: { applied_at: null },
        newValues: { applied_at: expect.any(String) },
      }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'billing_profiles' }),
    );
    expect(logAudit).toHaveBeenCalledTimes(2);
  });

  it('does not re-check the maker-checker rule (the approval already happened)', async () => {
    authorizePermission.mockResolvedValue({ authorized: true, userId: 'maker-1', error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: stuckRow(), error: null }))
      .mockReturnValueOnce(preRead())
      .mockReturnValueOnce(createQuery({ data: null, error: null }))
      .mockReturnValueOnce(createQuery({ data: { id: 'req-1' }, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result.success).toBe(true);
  });

  it('returns the apply error and leaves the row untouched, with no audit', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: stuckRow(), error: null }))
      .mockReturnValueOnce(preRead())
      .mockReturnValueOnce(createQuery({ data: null, error: { message: 'boom' } }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result).toEqual({ success: false, error: 'Failed to update billing profile: boom' });
    expect(from).toHaveBeenCalledTimes(3); // no applied_at update
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('reports a lost race as already applied, without auditing the approval request', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: stuckRow(), error: null }))
      .mockReturnValueOnce(preRead())
      .mockReturnValueOnce(createQuery({ data: null, error: null }))
      .mockReturnValueOnce(createQuery({ data: null, error: null })); // guarded update matched 0 rows
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result).toEqual({ success: false, error: 'This request has already been applied' });
    expect(
      logAudit.mock.calls.filter(([a]) => a.entityType === 'approval_requests'),
    ).toHaveLength(0);
  });
});
