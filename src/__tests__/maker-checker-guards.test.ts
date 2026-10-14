import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveRequest, rejectRequest } from '@/actions/approvals';
import { approveLateFeeWaiver } from '@/actions/billing/late-fee-waivers';

const { createServerSupabaseClient, authorizePermission, logAudit } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn() }));

/** Chainable query double: every builder method returns itself; awaiting or
 *  single()/maybeSingle() resolves to `result`. */
function createQuery(result: unknown) {
  const promise = Promise.resolve(result);
  const query: Record<string, unknown> = {
    then: (promise as Promise<unknown>).then.bind(promise),
  };
  for (const m of ['select', 'update', 'eq']) {
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

const waiverRow = (over: Record<string, unknown> = {}) => ({
  id: 'w-1',
  status: 'pending',
  requested_by: 'maker-1',
  invoice_id: 'inv-1',
  waiver_type: 'full',
  original_late_fee: 100,
  waiver_amount: null,
  invoice: { id: 'inv-1', invoice_number: 'INV-1', amount_due: 500, metadata: {} },
  ...over,
});

describe('approveLateFeeWaiver maker-checker (#473)', () => {
  it('refuses when the approver is the requester and writes nothing', async () => {
    authorizePermission.mockResolvedValue({ authorized: true, userId: 'maker-1', error: null });
    const fetchQ = createQuery({ data: waiverRow(), error: null });
    const from = vi.fn().mockReturnValueOnce(fetchQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveLateFeeWaiver('w-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/own/i);
    expect(from).toHaveBeenCalledTimes(1);
    expect(fetchQ.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("approves a different user's request, claiming it with a pending guard", async () => {
    const fetchQ = createQuery({ data: waiverRow(), error: null });
    const claimQ = createQuery({ data: { id: 'w-1', status: 'approved' }, error: null });
    const invoiceQ = createQuery({ data: null, error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(fetchQ)
      .mockReturnValueOnce(claimQ)
      .mockReturnValueOnce(invoiceQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveLateFeeWaiver('w-1');

    expect(result.success).toBe(true);
    expect(claimQ.eq).toHaveBeenCalledWith('status', 'pending');
    expect(invoiceQ.update).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }));
  });

  it('does not touch the invoice or audit when the waiver was already approved concurrently', async () => {
    const fetchQ = createQuery({ data: waiverRow(), error: null });
    const claimQ = createQuery({ data: null, error: null }); // guarded UPDATE matched 0 rows
    const from = vi.fn().mockReturnValueOnce(fetchQ).mockReturnValueOnce(claimQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveLateFeeWaiver('w-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already been processed/i);
    expect(from).toHaveBeenCalledTimes(2); // no invoice update
    expect(logAudit).not.toHaveBeenCalled();
  });

  const failingInvoiceSetup = (releaseResult: unknown) => {
    const fetchQ = createQuery({ data: waiverRow(), error: null });
    const claimQ = createQuery({ data: { id: 'w-1', status: 'approved' }, error: null });
    const invoiceQ = createQuery({ data: null, error: { message: 'invoice boom' } });
    const releaseQ = createQuery(releaseResult);
    const from = vi
      .fn()
      .mockReturnValueOnce(fetchQ)
      .mockReturnValueOnce(claimQ)
      .mockReturnValueOnce(invoiceQ)
      .mockReturnValueOnce(releaseQ);
    createServerSupabaseClient.mockResolvedValue({ from });
    return releaseQ;
  };

  it('releases the claim (guarded on approved) when the invoice update fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const releaseQ = failingInvoiceSetup({ data: null, error: null });

    const result = await approveLateFeeWaiver('w-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to update invoice');
    expect(releaseQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(releaseQ.eq).toHaveBeenCalledWith('status', 'approved');
    expect(logAudit).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('reports a possibly stuck waiver, logging the error object, when the release fails too', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    failingInvoiceSetup({ data: null, error: { message: 'release failed' } });

    const result = await approveLateFeeWaiver('w-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/stuck/i);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('stuck'),
      expect.objectContaining({ message: 'release failed' }),
    );
    errSpy.mockRestore();
  });

  it('refuses a non-pending waiver outright', async () => {
    const fetchQ = createQuery({ data: waiverRow({ status: 'approved' }), error: null });
    const from = vi.fn().mockReturnValueOnce(fetchQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveLateFeeWaiver('w-1');

    expect(result.success).toBe(false);
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe('approveRequest maker-checker and pending guard (#473)', () => {
  const requestRow = (over: Record<string, unknown> = {}) => ({
    id: 'req-1',
    request_type: 'billing_profile_effective_date',
    status: 'pending',
    requested_by: 'maker-1',
    entity_id: 'profile-1',
    entity_type: 'billing_profile',
    requested_changes: { effective_date: '2026-10-01' },
    ...over,
  });

  it('refuses when the approver is the requester, before applying any change', async () => {
    authorizePermission.mockResolvedValue({ authorized: true, userId: 'maker-1', error: null });
    const fetchQ = createQuery({ data: requestRow(), error: null });
    const from = vi.fn().mockReturnValueOnce(fetchQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/own/i);
    expect(from).toHaveBeenCalledTimes(1);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('guards the status UPDATE on pending and reports a lost race without auditing', async () => {
    const fetchQ = createQuery({ data: requestRow(), error: null });
    const updateQ = createQuery({ data: null, error: null }); // claim matched 0 rows
    const from = vi.fn().mockReturnValueOnce(fetchQ).mockReturnValueOnce(updateQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(updateQ.eq).toHaveBeenCalledWith('status', 'pending');
    expect(from).toHaveBeenCalledTimes(2); // changes never applied
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already been processed/i);
    expect(logAudit).not.toHaveBeenCalled();
  });

  const applyFailureSetup = (releaseResult: unknown) => {
    const fetchQ = createQuery({ data: requestRow(), error: null });
    const claimQ = createQuery({ data: { id: 'req-1' }, error: null });
    const applyQ = createQuery({ data: null, error: { message: 'boom' } });
    const releaseQ = createQuery(releaseResult);
    const from = vi
      .fn()
      .mockReturnValueOnce(fetchQ)
      .mockReturnValueOnce(claimQ)
      .mockReturnValueOnce(applyQ)
      .mockReturnValueOnce(releaseQ);
    createServerSupabaseClient.mockResolvedValue({ from });
    return releaseQ;
  };

  it('releases the claim when applying the changes fails', async () => {
    const releaseQ = applyFailureSetup({ data: null, error: null });

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(releaseQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(releaseQ.eq).toHaveBeenCalledWith('status', 'approved');
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('surfaces a stuck claim when the release also fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    applyFailureSetup({ data: null, error: { message: 'release failed' } });

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/stuck/i);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('stuck'),
      expect.objectContaining({ message: 'release failed' }),
    );
    errSpy.mockRestore();
  });

  it('refuses an already-approved request', async () => {
    const fetchQ = createQuery({ data: requestRow({ status: 'approved' }), error: null });
    const from = vi.fn().mockReturnValueOnce(fetchQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await approveRequest('req-1');

    expect(result.success).toBe(false);
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe('rejectRequest pending guard (#554)', () => {
  const requestRow = (over: Record<string, unknown> = {}) => ({
    id: 'req-1',
    request_type: 'billing_profile_effective_date',
    status: 'pending',
    requested_by: 'maker-1',
    ...over,
  });

  it('rejects a pending request with a status-guarded update and one REJECT audit', async () => {
    const fetchQ = createQuery({ data: requestRow(), error: null });
    const updateQ = createQuery({ data: { id: 'req-1' }, error: null });
    const from = vi.fn().mockReturnValueOnce(fetchQ).mockReturnValueOnce(updateQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await rejectRequest('req-1', 'no thanks');

    expect(result).toEqual({ success: true, error: null });
    expect(updateQ.eq).toHaveBeenCalledWith('status', 'pending');
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REJECT', entityType: 'approval_requests' }),
    );
  });

  it('reports a lost race without auditing', async () => {
    const fetchQ = createQuery({ data: requestRow(), error: null });
    const updateQ = createQuery({ data: null, error: null }); // 0 rows matched
    const from = vi.fn().mockReturnValueOnce(fetchQ).mockReturnValueOnce(updateQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await rejectRequest('req-1');

    expect(updateQ.eq).toHaveBeenCalledWith('status', 'pending');
    expect(result).toEqual({ success: false, error: 'Request has already been processed' });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses an already-processed request without updating', async () => {
    const fetchQ = createQuery({ data: requestRow({ status: 'approved' }), error: null });
    const from = vi.fn().mockReturnValueOnce(fetchQ);
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await rejectRequest('req-1');

    expect(result).toEqual({ success: false, error: 'Request has already been processed' });
    expect(from).toHaveBeenCalledTimes(1);
    expect(logAudit).not.toHaveBeenCalled();
  });
});
