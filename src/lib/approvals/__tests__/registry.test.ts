import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveRequest, rejectRequest } from '@/actions/approvals';
import { createApprovalRequest } from '@/lib/approvals/create-approval-request';
import { getApprovalHandler } from '@/lib/approvals/registry';

const { createServerSupabaseClient, authorizePermission, logAudit, notifyAdmins } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  notifyAdmins: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins }));

/** Chainable query double: builder methods return itself; awaiting or single()/maybeSingle()
 *  resolves to `result`. */
function createQuery(result: unknown) {
  const promise = Promise.resolve(result);
  const query: Record<string, unknown> = {
    then: (promise as Promise<unknown>).then.bind(promise),
  };
  for (const m of ['select', 'update', 'insert', 'eq']) {
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
  notifyAdmins.mockReset();
  authorizePermission.mockResolvedValue({ authorized: true, userId: 'approver-1', error: null });
});

const requestRow = (over: Record<string, unknown> = {}) => ({
  id: 'req-1',
  request_type: 'house_plots_change',
  status: 'pending',
  requested_by: 'maker-1',
  entity_id: 'house-1',
  entity_type: 'house',
  requested_changes: { number_of_plots: 3 },
  ...over,
});

const releaseOk = { data: null, error: null };

/** Queries in call order: fetch, claim, then whatever `rest` supplies (pre-read, write, release). */
function setup(request: Record<string, unknown>, rest: unknown[]) {
  const queries = [
    createQuery({ data: request, error: null }),
    createQuery({ data: { id: 'req-1' }, error: null }),
    ...rest.map((r) => createQuery(r)),
  ];
  const from = vi.fn();
  for (const q of queries) from.mockReturnValueOnce(q);
  createServerSupabaseClient.mockResolvedValue({ from });
  return { from, queries };
}

const houseRead = { data: { house_number: '12', number_of_plots: 1 }, error: null };

describe('getApprovalHandler', () => {
  it('has handlers for the two handled types only', () => {
    expect(getApprovalHandler('billing_profile_effective_date')).toBeDefined();
    expect(getApprovalHandler('house_plots_change')).toBeDefined();
    expect(getApprovalHandler('late_fee_waiver')).toBeUndefined();
    expect(getApprovalHandler('toString')).toBeUndefined();
  });

  it('house schema accepts positive integers only', () => {
    const schema = getApprovalHandler('house_plots_change')!.schema;
    expect(schema.safeParse({ number_of_plots: 2 }).success).toBe(true);
    expect(schema.safeParse({ number_of_plots: 0 }).success).toBe(false);
    expect(schema.safeParse({ number_of_plots: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ number_of_plots: '2' }).success).toBe(false);
  });

  it('billing schema accepts a valid date string only', () => {
    const schema = getApprovalHandler('billing_profile_effective_date')!.schema;
    expect(schema.safeParse({ effective_date: '2026-10-01' }).success).toBe(true);
    expect(schema.safeParse({ effective_date: '' }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ effective_date: 20261001 }).success).toBe(false);
    expect(schema.safeParse({ effective_date: 'not-a-date' }).success).toBe(false);
  });
});

describe('approveRequest applies through the registry', () => {
  it('house_plots_change: writes the house, audits the entity UPDATE, then APPROVE', async () => {
    const { queries } = setup(requestRow(), [houseRead, { data: null, error: null }, { data: null, error: null }]); // last: applied_at update (#557)
    const writeQ = queries[3];

    const result = await approveRequest('req-1');

    expect(result).toEqual({ success: true, error: null });
    expect(writeQ.update).toHaveBeenCalledWith(expect.objectContaining({ number_of_plots: 3 }));
    expect(writeQ.eq).toHaveBeenCalledWith('id', 'house-1');
    expect(logAudit).toHaveBeenCalledTimes(2);
    expect(logAudit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'houses',
        entityId: 'house-1',
        entityDisplay: '12',
        oldValues: { number_of_plots: 1 },
        newValues: { number_of_plots: 3 },
        metadata: { approval_request_id: 'req-1' },
      }),
    );
    expect(logAudit.mock.calls[1][0]).toEqual(
      expect.objectContaining({ action: 'APPROVE', entityType: 'approval_requests' }),
    );
  });

  it('billing_profile_effective_date: audits the billing_profiles UPDATE, then APPROVE', async () => {
    setup(
      requestRow({
        request_type: 'billing_profile_effective_date',
        entity_id: 'profile-1',
        entity_type: 'billing_profile',
        requested_changes: { effective_date: '2026-10-01' },
      }),
      [
        { data: { name: 'Levy', effective_date: '2026-01-01' }, error: null },
        { data: null, error: null },
        { data: null, error: null }, // applied_at update (#557)
      ],
    );

    const result = await approveRequest('req-1');

    expect(result.success).toBe(true);
    expect(logAudit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'billing_profiles',
        entityId: 'profile-1',
        entityDisplay: 'Levy',
        oldValues: { effective_date: '2026-01-01' },
        newValues: { effective_date: '2026-10-01' },
        metadata: { approval_request_id: 'req-1' },
      }),
    );
    expect(logAudit.mock.calls[1][0]).toEqual(expect.objectContaining({ action: 'APPROVE' }));
  });

  it('a failed write writes no entity audit, releases the claim and does not APPROVE', async () => {
    const { queries } = setup(requestRow(), [houseRead, { data: null, error: { message: 'boom' } }, releaseOk]);
    const releaseQ = queries[4];

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to update house');
    expect(releaseQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(releaseQ.eq).toHaveBeenCalledWith('status', 'approved');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('a failed pre-read releases the claim and never writes the entity', async () => {
    const { from, queries } = setup(requestRow(), [{ data: null, error: { message: 'read boom' } }, releaseOk]);
    const releaseQ = queries[3];

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to read house');
    expect(from).toHaveBeenCalledTimes(4); // fetch, claim, pre-read, release: no entity write
    expect(queries[2].update).not.toHaveBeenCalled();
    expect(releaseQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['empty plots', 0],
    ['negative plots', -1],
  ])('right key but bad house value (%s) is released with an Invalid requested changes error', async (_n, v) => {
    const { from, queries } = setup(requestRow({ requested_changes: { number_of_plots: v } }), [releaseOk]);

    const result = await approveRequest('req-1');

    expect(result.error).toMatch(/^Invalid requested changes for house_plots_change/);
    expect(from).toHaveBeenCalledTimes(3);
    expect(queries[2].update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('right key but bad billing value is released with an Invalid requested changes error', async () => {
    const { from, queries } = setup(
      requestRow({
        request_type: 'billing_profile_effective_date',
        entity_id: 'profile-1',
        entity_type: 'billing_profile',
        requested_changes: { effective_date: 'not-a-date' },
      }),
      [releaseOk],
    );

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^Invalid requested changes for billing_profile_effective_date/);
    expect(from).toHaveBeenCalledTimes(3); // fetch, claim, release: no entity read or write
    expect(queries[2].update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['an error', { data: null, error: { message: 'read boom' } }],
    ['no row', { data: null, error: null }],
    [
      'an error alongside a row',
      { data: { name: 'Levy', effective_date: '2026-01-01' }, error: { message: 'read boom' } },
    ],
  ])('a billing pre-read returning %s fails the apply, releases, and writes nothing', async (_n, preRead) => {
    const { from, queries } = setup(
      requestRow({
        request_type: 'billing_profile_effective_date',
        entity_id: 'profile-1',
        entity_type: 'billing_profile',
        requested_changes: { effective_date: '2026-10-01' },
      }),
      [preRead, releaseOk],
    );

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to read billing profile');
    expect(from).toHaveBeenCalledTimes(4); // fetch, claim, pre-read, release: no write
    expect(queries[2].update).not.toHaveBeenCalled();
    expect(queries[3].update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['missing field', {}],
    ['wrong type', { number_of_plots: 'three' }],
    ['non-integer', { number_of_plots: 2.5 }],
  ])('malformed requested_changes (%s) releases the claim with no write or audit', async (_n, changes) => {
    const { from, queries } = setup(requestRow({ requested_changes: changes }), [releaseOk]);
    const releaseQ = queries[2];

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^Invalid requested changes for house_plots_change/);
    expect(from).toHaveBeenCalledTimes(3); // fetch, claim, release: no entity read or write
    expect(releaseQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('late_fee_waiver still fails closed with the original message', async () => {
    const { queries } = setup(requestRow({ request_type: 'late_fee_waiver', requested_changes: {} }), [releaseOk]);
    const releaseQ = queries[2];

    const result = await approveRequest('req-1');

    expect(result).toEqual({
      success: false,
      error: 'Unhandled approval request type: late_fee_waiver',
    });
    expect(releaseQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses a self-approval before claiming', async () => {
    authorizePermission.mockResolvedValue({ authorized: true, userId: 'maker-1', error: null });
    const { from } = setup(requestRow(), []);

    const result = await approveRequest('req-1');

    expect(result).toEqual({ success: false, error: 'You cannot approve your own request' });
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe('rejectRequest through the shared decision core', () => {
  const rejectSetup = (request: Record<string, unknown>, claim: unknown) => {
    const fetchQ = createQuery({ data: request, error: null });
    const updateQ = createQuery(claim);
    const from = vi.fn().mockReturnValueOnce(fetchQ).mockReturnValueOnce(updateQ);
    createServerSupabaseClient.mockResolvedValue({ from });
    return { from, updateQ };
  };

  it('rejects a pending request and audits REJECT', async () => {
    const { updateQ } = rejectSetup(requestRow(), { data: { id: 'req-1' }, error: null });

    const result = await rejectRequest('req-1', 'nope');

    expect(result).toEqual({ success: true, error: null });
    expect(updateQ.eq).toHaveBeenCalledWith('status', 'pending');
    expect(updateQ.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', reviewed_by: 'approver-1', review_notes: 'nope' }),
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT' }));
  });

  it('reports a lost race', async () => {
    rejectSetup(requestRow(), { data: null, error: null });

    expect(await rejectRequest('req-1')).toEqual({
      success: false,
      error: 'Request has already been processed',
    });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses a non-pending request', async () => {
    const { from } = rejectSetup(requestRow({ status: 'approved' }), { data: null, error: null });

    expect(await rejectRequest('req-1')).toEqual({
      success: false,
      error: 'Request has already been processed',
    });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('lets a requester reject their own request', async () => {
    authorizePermission.mockResolvedValue({ authorized: true, userId: 'maker-1', error: null });
    rejectSetup(requestRow(), { data: { id: 'req-1' }, error: null });

    expect(await rejectRequest('req-1')).toEqual({ success: true, error: null });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT' }));
  });
});

describe('createApprovalRequest validation', () => {
  const createSetup = () => {
    const existingQ = createQuery({ data: null, error: null });
    const insertQ = createQuery({ data: { id: 'new-1' }, error: null });
    const from = vi.fn().mockReturnValueOnce(existingQ).mockReturnValueOnce(insertQ);
    createServerSupabaseClient.mockResolvedValue({
      from,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'maker-1' } } }) },
    });
    return { from, insertQ };
  };

  const valid = {
    request_type: 'house_plots_change' as const,
    entity_type: 'house' as const,
    entity_id: 'house-1',
    requested_changes: { number_of_plots: 2 },
    current_values: { number_of_plots: 1 },
  };

  it('inserts, audits CREATE and notifies for a valid payload', async () => {
    const { insertQ } = createSetup();

    const result = await createApprovalRequest(valid);

    expect(result).toEqual({ success: true, request_id: 'new-1', error: null });
    expect(insertQ.insert).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }));
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid payload before querying or inserting', async () => {
    const { from } = createSetup();

    const result = await createApprovalRequest({ ...valid, requested_changes: { number_of_plots: 'x' } });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^Invalid requested changes for house_plots_change/);
    expect(from).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it('rejects an unsupported type before querying or inserting', async () => {
    const { from } = createSetup();

    const result = await createApprovalRequest({ ...valid, request_type: 'late_fee_waiver' });

    expect(result).toEqual({
      success: false,
      error: 'Unsupported approval request type: late_fee_waiver',
    });
    expect(from).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });
});
