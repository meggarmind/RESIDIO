import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveRequest, rejectRequest } from '@/actions/approvals';
import { notifyRequesterOfOutcome } from '@/lib/approvals/notify-requester';

const { createServerSupabaseClient, authorizePermission, logAudit, notifyUser } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  notifyUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));
// notifyUser itself throws here, so only the outer catch in notifyRequesterOfOutcome can contain it.
vi.mock('@/lib/notifications/user-notifier', () => ({ notifyUser }));

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

const request = { id: 'req-1', request_type: 'house_plots_change', requested_by: 'maker-1' };

beforeEach(() => {
  createServerSupabaseClient.mockReset();
  authorizePermission.mockReset();
  logAudit.mockReset();
  notifyUser.mockReset();
  notifyUser.mockRejectedValue(new Error('notifier exploded'));
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'approver-1', error: null });
});

describe('notifyRequesterOfOutcome outer catch (#559)', () => {
  it('resolves and logs with the request id when notifyUser throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      notifyRequesterOfOutcome({ request, outcome: 'approved', reviewerId: 'approver-1' }),
    ).resolves.toBeUndefined();

    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('[notifyRequesterOfOutcome]'),
      expect.objectContaining({ message: 'notifier exploded' }),
    );
    expect(errSpy.mock.calls[0][0]).toContain('req-1');
    errSpy.mockRestore();
  });

  it('leaves rejectRequest result unchanged when notifyUser throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: { ...request, status: 'pending' }, error: null }))
      .mockReturnValueOnce(createQuery({ data: { id: 'req-1' }, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await rejectRequest('req-1', 'no');

    expect(result).toEqual({ success: true, error: null });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT' }));
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('[notifyRequesterOfOutcome]'),
      expect.anything(),
    );
    errSpy.mockRestore();
  });

  it('leaves approveRequest result unchanged when notifyUser throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const row = {
      ...request,
      status: 'pending',
      request_type: 'billing_profile_effective_date',
      requested_changes: { effective_date: '2026-10-01' },
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(createQuery({ data: row, error: null }))
      .mockReturnValueOnce(createQuery({ data: { id: 'req-1' }, error: null }))
      .mockReturnValueOnce(
        createQuery({ data: { name: 'P', effective_date: '2026-01-01' }, error: null }),
      )
      .mockReturnValueOnce(createQuery({ data: null, error: null }))
      .mockReturnValueOnce(createQuery({ data: null, error: null }));
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result).toEqual({ success: true, error: null });
    expect(notifyUser).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});
