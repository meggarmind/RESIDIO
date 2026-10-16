import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveRequest, rejectRequest, reapplyApprovedRequest } from '@/actions/approvals';
import { notifyRequesterOfOutcome } from '@/lib/approvals/notify-requester';

const { createServerSupabaseClient, createAdminClient, authorizePermission, logAudit } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient, createAdminClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));

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

/** Admin client double whose in_app_notifications insert is observable. */
function adminWithInsert(insertResult: unknown = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  createAdminClient.mockResolvedValue({ from });
  return { insert, from };
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const requestRow = (over: Record<string, unknown> = {}) => ({
  id: 'req-1',
  request_type: 'billing_profile_effective_date',
  status: 'pending',
  requested_by: 'maker-1',
  entity_id: 'profile-1',
  entity_type: 'billing_profile',
  requested_changes: { effective_date: '2026-10-01', secret_marker: 'DO-NOT-LEAK' },
  reviewed_at: null,
  review_notes: null,
  applied_at: null,
  ...over,
});

const preRead = () =>
  createQuery({ data: { name: 'Profile 1', effective_date: '2026-01-01' }, error: null });

beforeEach(() => {
  createServerSupabaseClient.mockReset();
  createAdminClient.mockReset();
  authorizePermission.mockReset();
  logAudit.mockReset();
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'approver-1', error: null });
});

describe('notifyRequesterOfOutcome (#559)', () => {
  const request = { id: 'req-1', request_type: 'house_plots_change', requested_by: 'maker-1' };

  it('inserts one in-app notification for the requester with label, outcome and link', async () => {
    const { insert, from } = adminWithInsert();

    await notifyRequesterOfOutcome({ request, outcome: 'approved', reviewerId: 'approver-1' });

    expect(from).toHaveBeenCalledWith('in_app_notifications');
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      recipient_id: 'maker-1',
      title: 'Request approved',
      action_url: '/approvals',
      is_read: false,
      category: 'info',
      priority: 'normal',
    });
    expect(row.body).toContain('House Plots Change');
    expect(row.body).toContain('approved');
  });

  it('includes review notes on rejection only', async () => {
    const { insert } = adminWithInsert();

    await notifyRequesterOfOutcome({ request, outcome: 'rejected', reviewerId: 'a', reviewNotes: 'Wrong plot count' });
    await notifyRequesterOfOutcome({ request, outcome: 'approved', reviewerId: 'a', reviewNotes: 'ok thanks' });

    expect(insert.mock.calls[0][0]).toMatchObject({ category: 'info', priority: 'high' });
    expect(insert.mock.calls[0][0].body).toContain('Reason: Wrong plot count');
    expect(insert.mock.calls[1][0].body).not.toContain('ok thanks');
  });

  it('falls back to the raw request_type when there is no label', async () => {
    const { insert } = adminWithInsert();

    await notifyRequesterOfOutcome({
      request: { ...request, request_type: 'brand_new_type' as never },
      outcome: 'rejected',
      reviewerId: 'a',
    });

    expect(insert.mock.calls[0][0].body).toContain('brand_new_type');
  });

  it('does not notify when the requester is the reviewer', async () => {
    const { insert } = adminWithInsert();

    await notifyRequesterOfOutcome({ request, outcome: 'rejected', reviewerId: 'maker-1' });

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('swallows an insert error and a thrown client, logging with context', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminWithInsert({ error: { message: 'insert boom' } });
    await expect(
      notifyRequesterOfOutcome({ request, outcome: 'approved', reviewerId: 'a' }),
    ).resolves.toBeUndefined();

    createAdminClient.mockRejectedValue(new Error('no client'));
    await expect(
      notifyRequesterOfOutcome({ request, outcome: 'approved', reviewerId: 'a' }),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('maker-1'), expect.anything());
    errSpy.mockRestore();
  });
});

describe('approveRequest notifies the requester (#559)', () => {
  it('notifies once, after apply, with no requested_changes values', async () => {
    const { insert } = adminWithInsert();
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: requestRow(), error: null }))
      .mockReturnValueOnce(createQuery({ data: { id: 'req-1' }, error: null }))
      .mockReturnValueOnce(preRead())
      .mockReturnValueOnce(createQuery({ data: null, error: null }))
      .mockReturnValueOnce(createQuery({ data: null, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result).toEqual({ success: true, error: null });
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.recipient_id).toBe('maker-1');
    expect(row.title).toBe('Request approved');
    expect(JSON.stringify(row)).not.toContain('DO-NOT-LEAK');
  });

  it('does not notify when the apply fails', async () => {
    const { insert } = adminWithInsert();
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: requestRow({ request_type: 'unknown_type' }), error: null }))
      .mockReturnValueOnce(createQuery({ data: { id: 'req-1' }, error: null }))
      .mockReturnValueOnce(createQuery({ data: null, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('does not notify when another approver wins the claim race', async () => {
    const { insert } = adminWithInsert();
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: requestRow(), error: null }))
      .mockReturnValueOnce(createQuery({ data: null, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result).toEqual({ success: false, error: 'Request has already been processed' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not notify when the requester approves their own request (blocked)', async () => {
    const { insert } = adminWithInsert();
    authorizePermission.mockResolvedValue({ authorized: true, userId: 'maker-1', error: null });
    const from = vi.fn().mockReturnValueOnce(createQuery({ data: requestRow(), error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result).toEqual({ success: false, error: 'You cannot approve your own request' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('keeps the result when the notification insert throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createAdminClient.mockRejectedValue(new Error('admin boom'));
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: requestRow(), error: null }))
      .mockReturnValueOnce(createQuery({ data: { id: 'req-1' }, error: null }))
      .mockReturnValueOnce(preRead())
      .mockReturnValueOnce(createQuery({ data: null, error: null }))
      .mockReturnValueOnce(createQuery({ data: null, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result).toEqual({ success: true, error: null });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }));
    errSpy.mockRestore();
  });
});

describe('reapplyApprovedRequest notifies the requester on completion (#559)', () => {
  it('notifies once when the re-apply completes', async () => {
    const { insert } = adminWithInsert();
    const from = vi
      .fn()
      .mockReturnValueOnce(
        createQuery({
          data: requestRow({ status: 'approved', reviewed_at: minutesAgo(30) }),
          error: null,
        }),
      )
      .mockReturnValueOnce(preRead())
      .mockReturnValueOnce(createQuery({ data: null, error: null }))
      .mockReturnValueOnce(createQuery({ data: { id: 'req-1' }, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result).toEqual({ success: true, error: null });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0].recipient_id).toBe('maker-1');
  });

  it('does not notify when a concurrent re-apply wins the applied_at mark', async () => {
    const { insert } = adminWithInsert();
    const from = vi
      .fn()
      .mockReturnValueOnce(
        createQuery({
          data: requestRow({ status: 'approved', reviewed_at: minutesAgo(30) }),
          error: null,
        }),
      )
      .mockReturnValueOnce(preRead())
      .mockReturnValueOnce(createQuery({ data: null, error: null }))
      .mockReturnValueOnce(createQuery({ data: null, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result).toEqual({ success: false, error: 'This request has already been applied' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not notify when the re-applier is the requester', async () => {
    const { insert } = adminWithInsert();
    authorizePermission.mockResolvedValue({ authorized: true, userId: 'maker-1', error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(
        createQuery({
          data: requestRow({ status: 'approved', reviewed_at: minutesAgo(30) }),
          error: null,
        }),
      )
      .mockReturnValueOnce(preRead())
      .mockReturnValueOnce(createQuery({ data: null, error: null }))
      .mockReturnValueOnce(createQuery({ data: { id: 'req-1' }, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result).toEqual({ success: true, error: null });
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not notify when the re-apply fails', async () => {
    const { insert } = adminWithInsert();
    const from = vi
      .fn()
      .mockReturnValueOnce(
        createQuery({
          data: requestRow({
            status: 'approved',
            reviewed_at: minutesAgo(30),
            request_type: 'unknown_type',
          }),
          error: null,
        }),
      );
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await reapplyApprovedRequest('req-1');

    expect(result.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('rejectRequest notifies the requester (#559)', () => {
  it('notifies with the review notes', async () => {
    const { insert } = adminWithInsert();
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: requestRow(), error: null }))
      .mockReturnValueOnce(createQuery({ data: { id: 'req-1' }, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await rejectRequest('req-1', 'Not justified');

    expect(result).toEqual({ success: true, error: null });
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.recipient_id).toBe('maker-1');
    expect(row.title).toBe('Request rejected');
    expect(row.body).toContain('Reason: Not justified');
  });

  it('does not notify when the requester withdraws their own request', async () => {
    const { insert } = adminWithInsert();
    authorizePermission.mockResolvedValue({ authorized: true, userId: 'maker-1', error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: requestRow(), error: null }))
      .mockReturnValueOnce(createQuery({ data: { id: 'req-1' }, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await rejectRequest('req-1');

    expect(result).toEqual({ success: true, error: null });
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not notify when another approver already processed it', async () => {
    const { insert } = adminWithInsert();
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: requestRow(), error: null }))
      .mockReturnValueOnce(createQuery({ data: null, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await rejectRequest('req-1');

    expect(result.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('keeps the result when the notification throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createAdminClient.mockRejectedValue(new Error('admin boom'));
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: requestRow(), error: null }))
      .mockReturnValueOnce(createQuery({ data: { id: 'req-1' }, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await rejectRequest('req-1', 'no');

    expect(result).toEqual({ success: true, error: null });
    errSpy.mockRestore();
  });
});
