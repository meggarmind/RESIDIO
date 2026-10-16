import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expirePendingApprovals } from '@/lib/approvals/expire-approvals';
import { createApprovalRequest } from '@/lib/approvals/create-approval-request';

const { createAdminClient, createServerSupabaseClient, notifyUser, getApprovalHandler } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  notifyUser: vi.fn(),
  getApprovalHandler: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createAdminClient, createServerSupabaseClient }));
vi.mock('@/lib/notifications/user-notifier', () => ({ notifyUser }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/approvals/registry', () => ({ getApprovalHandler }));

/** Chainable, awaitable query double resolving to `result`. */
function query(result: unknown) {
  const promise = Promise.resolve(result);
  const q: Record<string, unknown> = { then: promise.then.bind(promise) };
  for (const m of ['select', 'eq', 'not', 'lte', 'in', 'like']) q[m] = vi.fn().mockReturnValue(q);
  return q;
}

function adminDouble(opts: {
  due: unknown;
  rpc: unknown;
  rejected?: unknown;
}) {
  const dueQ = query(opts.due);
  const rejectedQ = query(opts.rejected ?? { data: [], error: null });
  const queries = [dueQ, rejectedQ];
  const from = vi.fn().mockImplementation(() => queries.shift());
  const rpc = vi.fn().mockResolvedValue(opts.rpc);
  createAdminClient.mockReturnValue({ from, rpc });
  return { from, rpc, dueQ, rejectedQ };
}

type Mock = ReturnType<typeof vi.fn>;
const calls = (q: Record<string, unknown>, method: string) => (q[method] as Mock).mock.calls;

describe('expirePendingApprovals (#558)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifyUser.mockResolvedValue({ success: true });
  });

  it('calls process_expired_approvals and notifies each requester of the expiry', async () => {
    const { rpc } = adminDouble({
      due: { data: [{ id: 'a' }, { id: 'b' }], error: null },
      rpc: { data: 2, error: null },
      rejected: {
        data: [
          { id: 'a', request_type: 'house_plots_change', requested_by: 'user-a' },
          { id: 'b', request_type: 'house_plots_change', requested_by: 'user-b' },
        ],
        error: null,
      },
    });

    const result = await expirePendingApprovals();

    expect(rpc).toHaveBeenCalledWith('process_expired_approvals');
    expect(result).toEqual({ expired: 2, notified: 2 });
    expect(notifyUser).toHaveBeenCalledTimes(2);
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'user-a',
        title: 'Request expired',
        body: expect.stringContaining('expired after 72 hours'),
        metadata: expect.objectContaining({ approval_request_id: 'a', outcome: 'expired' }),
      })
    );
    expect(notifyUser).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'user-b' }));
  });

  it('does not notify anyone when nothing expired', async () => {
    adminDouble({ due: { data: [], error: null }, rpc: { data: 0, error: null } });
    await expect(expirePendingApprovals()).resolves.toEqual({ expired: 0, notified: 0 });
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it('keeps notifying the rest when one notification throws', async () => {
    adminDouble({
      due: { data: [{ id: 'a' }, { id: 'b' }], error: null },
      rpc: { data: 2, error: null },
      rejected: {
        data: [
          { id: 'a', request_type: 'house_plots_change', requested_by: 'user-a' },
          { id: 'b', request_type: 'house_plots_change', requested_by: 'user-b' },
        ],
        error: null,
      },
    });
    notifyUser.mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await expirePendingApprovals();

    expect(result.expired).toBe(2);
    expect(notifyUser).toHaveBeenCalledTimes(2);
    expect(notifyUser).toHaveBeenLastCalledWith(expect.objectContaining({ recipientId: 'user-b' }));
  });

  it('throws when the rpc fails so the run is recorded as a failure', async () => {
    adminDouble({ due: { data: [{ id: 'a' }], error: null }, rpc: { data: null, error: { message: 'nope' } } });
    await expect(expirePendingApprovals()).rejects.toThrow('process_expired_approvals failed: nope');
    expect(notifyUser).not.toHaveBeenCalled();
  });
});

describe('expirePendingApprovals filters and error paths (#558)', () => {
  const twoRows = {
    data: [
      { id: 'a', request_type: 'house_plots_change', requested_by: 'user-a' },
      { id: 'b', request_type: 'house_plots_change', requested_by: 'user-b' },
    ],
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    notifyUser.mockResolvedValue({ success: true });
  });

  it('due read targets approval_requests, pending, with a non-null expires_at at or before now', async () => {
    const before = Date.now();
    const { from, dueQ } = adminDouble({
      due: { data: [{ id: 'a' }, { id: 'b' }], error: null },
      rpc: { data: 2, error: null },
      rejected: twoRows,
    });
    await expirePendingApprovals();
    const after = Date.now();

    expect(from).toHaveBeenNthCalledWith(1, 'approval_requests');
    expect(calls(dueQ, 'select')).toEqual([['id']]);
    expect(calls(dueQ, 'eq')).toEqual([['status', 'pending']]);
    expect(calls(dueQ, 'not')).toEqual([['expires_at', 'is', null]]);
    const lte = calls(dueQ, 'lte');
    expect(lte).toHaveLength(1);
    expect(lte[0][0]).toBe('expires_at');
    const cutoff = new Date(lte[0][1] as string);
    expect(cutoff.toISOString()).toBe(lte[0][1]);
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after);
  });

  it('readback is limited to exactly the due ids, rejected, and auto-rejected notes', async () => {
    const { from, rejectedQ } = adminDouble({
      due: { data: [{ id: 'a' }, { id: 'b' }], error: null },
      rpc: { data: 2, error: null },
      rejected: twoRows,
    });
    await expirePendingApprovals();

    expect(from).toHaveBeenNthCalledWith(2, 'approval_requests');
    expect(calls(rejectedQ, 'select')).toEqual([['id, request_type, requested_by']]);
    expect(calls(rejectedQ, 'in')).toEqual([['id', ['a', 'b']]]);
    expect(calls(rejectedQ, 'eq')).toEqual([['status', 'rejected']]);
    expect(calls(rejectedQ, 'like')).toEqual([['review_notes', 'Auto-rejected%']]);
  });

  it('throws without calling the rpc when the due read fails', async () => {
    const { rpc } = adminDouble({
      due: { data: null, error: { message: 'read failed' } },
      rpc: { data: 5, error: null },
    });
    await expect(expirePendingApprovals()).rejects.toThrow('Failed to list expiring approvals: read failed');
    expect(rpc).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it('does not throw when the readback fails, returns notified 0 and logs the error', async () => {
    const readbackError = { message: 'readback failed' };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminDouble({
      due: { data: [{ id: 'a' }], error: null },
      rpc: { data: 1, error: null },
      rejected: { data: null, error: readbackError },
    });

    await expect(expirePendingApprovals()).resolves.toEqual({ expired: 1, notified: 0 });
    expect(notifyUser).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('expirePendingApprovals'), readbackError);
    errorSpy.mockRestore();
  });

  it('skips the readback entirely when the rpc rejected rows but none were pre-read as due', async () => {
    const { from } = adminDouble({
      due: { data: [], error: null },
      rpc: { data: 3, error: null },
      rejected: twoRows,
    });
    await expect(expirePendingApprovals()).resolves.toEqual({ expired: 3, notified: 0 });
    expect(from).toHaveBeenCalledTimes(1);
    expect(notifyUser).not.toHaveBeenCalled();
  });
});

describe('createApprovalRequest expiry (#558)', () => {
  it('stamps expires_at 72 hours after creation', async () => {
    getApprovalHandler.mockReturnValue({ schema: { safeParse: () => ({ success: true }) } });
    const insert = vi.fn();
    const lookup = query({ data: null, error: null });
    (lookup as Record<string, unknown>).single = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValueOnce(lookup).mockReturnValueOnce({ insert });
    const insertQuery = query({ data: { id: 'new-1' }, error: null });
    (insertQuery as Record<string, unknown>).single = vi.fn().mockResolvedValue({ data: { id: 'new-1' }, error: null });
    insert.mockReturnValue(insertQuery);
    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from,
    });

    const before = Date.now();
    const result = await createApprovalRequest({
      request_type: 'house_plots_change' as never,
      entity_type: 'house' as never,
      entity_id: 'h1',
      requested_changes: {},
      current_values: {},
    });
    const after = Date.now();

    expect(result.success).toBe(true);
    const row = insert.mock.calls[0][0] as { expires_at: string };
    const expiresAt = new Date(row.expires_at).getTime();
    const window = 72 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + window);
    expect(expiresAt).toBeLessThanOrEqual(after + window);
  });
});
