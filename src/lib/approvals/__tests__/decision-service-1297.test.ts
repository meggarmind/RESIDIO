import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveRequest, rejectRequest } from '@/actions/approvals';
import { decideAsServiceAccount, type LiveReviewer } from '@/lib/approvals/decision';
import { settleReportedPayment } from '@/lib/whatsapp/payment-report-settlement';

const { createServerSupabaseClient, createAdminClient, authorizePermission, logAudit, recordAudit, notifyRequesterOfOutcome } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  recordAudit: vi.fn(),
  notifyRequesterOfOutcome: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient, createAdminClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/audit/recorder', () => ({ recordAudit }));
vi.mock('@/lib/approvals/notify-requester', () => ({ notifyRequesterOfOutcome }));
vi.mock('@/lib/whatsapp/payment-report-settlement', () => ({ settleReportedPayment: vi.fn() }));
vi.mock('@/lib/whatsapp/clearance-approval', () => ({ issueApprovedClearance: vi.fn() }));

/** Chainable query double: builder methods return itself; awaiting or single()/maybeSingle() resolves to `result`. */
function createQuery(result: unknown) {
  const promise = Promise.resolve(result);
  const query: Record<string, unknown> = { then: (promise as Promise<unknown>).then.bind(promise) };
  for (const m of ['select', 'update', 'insert', 'eq']) query[m] = vi.fn().mockReturnValue(query);
  query.single = vi.fn().mockResolvedValue(result);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  return query as Record<string, ReturnType<typeof vi.fn>>;
}

const FO = 'fo-profile';
const FULL: LiveReviewer = { permissions: ['approvals.approve_reject', 'payments.verify', 'whatsapp_admin.approve_payment'], residentId: 'fo-resident' };

const report = (over: Record<string, unknown> = {}) => ({
  id: 'req-1',
  request_type: 'whatsapp_payment_report',
  status: 'pending',
  requested_by: null,
  requested_by_resident_id: 'resident-7',
  entity_type: 'payment_record',
  entity_id: 'payment-1',
  requested_changes: { amount: 50000, payment_date: '2026-10-12', property: '12 Palm Close', reference: 'GTB TRF 1234' },
  ...over,
});

/** Queries in call order: fetch, claim, applied_at. Returns the `from` spy and the queries. */
function client(request: Record<string, unknown> | null, claim: unknown = { id: 'req-1' }) {
  const queries = [
    createQuery({ data: request, error: request ? null : { message: 'none' } }),
    createQuery({ data: claim, error: null }),
    createQuery({ data: null, error: null }),
  ];
  const from = vi.fn();
  for (const q of queries) from.mockReturnValueOnce(q);
  return { from, queries };
}

const service = (over: Partial<Parameters<typeof decideAsServiceAccount>[0]> = {}, live: LiveReviewer = FULL) =>
  decideAsServiceAccount({
    profileId: FO,
    requestId: 'req-1',
    decision: 'approve',
    requestType: 'whatsapp_payment_report',
    alsoRequires: ['whatsapp_admin.approve_payment', 'payments.verify'],
    metadata: { channel: 'whatsapp_admin' },
    loadReviewer: vi.fn().mockResolvedValue(live),
    ...over,
  });

beforeEach(() => {
  vi.clearAllMocks();
  authorizePermission.mockResolvedValue({ authorized: true, userId: FO, error: null });
  vi.mocked(settleReportedPayment).mockResolvedValue({ success: true });
  notifyRequesterOfOutcome.mockResolvedValue(undefined);
});

/** What a decision wrote: the claim payload (timestamps out), the settle call and the audit entries. */
function written(queries: Record<string, ReturnType<typeof vi.fn>>[], audits: unknown[][]) {
  const claim = { ...queries[1].update.mock.calls[0][0] };
  delete claim.reviewed_at;
  delete claim.updated_at;
  return {
    claim,
    claimGuard: queries[1].eq.mock.calls,
    settle: vi.mocked(settleReportedPayment).mock.calls,
    audits: audits.map(([entry]) => {
      const { metadata, ...rest } = entry as { metadata?: Record<string, unknown> };
      const other = { ...metadata };
      delete other.channel;
      return { ...rest, metadata: Object.keys(other).length ? other : undefined };
    }),
  };
}

describe('approving a payment report as a service account (#1297)', () => {
  it('writes the same claim, settlement and audits as the dashboard approval, plus the channel', async () => {
    const dashboard = client(report());
    createServerSupabaseClient.mockResolvedValue({ from: dashboard.from });
    expect(await approveRequest('req-1')).toEqual({ success: true, error: null, warning: undefined });
    const fromDashboard = written(dashboard.queries, logAudit.mock.calls);

    vi.mocked(settleReportedPayment).mockClear();
    const whatsapp = client(report());
    createAdminClient.mockReturnValue({ from: whatsapp.from });
    expect(await service()).toEqual({ success: true, error: null, warning: undefined });
    const fromWhatsApp = written(whatsapp.queries, recordAudit.mock.calls);

    expect(fromWhatsApp).toEqual(fromDashboard);
    expect(fromWhatsApp.claim).toEqual({ status: 'approved', reviewed_by: FO, review_notes: null });
    expect(fromWhatsApp.settle).toEqual([['payment-1', FO]]);
    expect(recordAudit.mock.calls.map(([entry, actor]) => [entry.action, entry.entityType, entry.metadata.channel, actor])).toEqual([
      ['VERIFY', 'payment_records', 'whatsapp_admin', { userId: FO }],
      ['APPROVE', 'approval_requests', 'whatsapp_admin', { userId: FO }],
    ]);
  });

  it('claims guarded on status pending', async () => {
    const { from, queries } = client(report());
    createAdminClient.mockReturnValue({ from });
    await service();
    expect(queries[1].eq).toHaveBeenCalledWith('status', 'pending');
  });

  it('refuses a request already handled, and one claimed by someone else meanwhile', async () => {
    createAdminClient.mockReturnValue({ from: client(report({ status: 'approved' })).from });
    expect(await service()).toEqual({ success: false, error: 'Request has already been processed' });

    createAdminClient.mockReturnValue({ from: client(report(), null).from });
    expect(await service()).toEqual({ success: false, error: 'Request has already been processed' });
    expect(settleReportedPayment).not.toHaveBeenCalled();
  });

  it('refuses the admin approving their own request, by profile or by their resident record', async () => {
    createAdminClient.mockReturnValue({ from: client(report({ requested_by: FO })).from });
    expect(await service()).toEqual({ success: false, error: 'You cannot approve your own request' });

    const own = client(report({ requested_by_resident_id: 'fo-resident' }));
    createAdminClient.mockReturnValue({ from: own.from });
    expect(await service()).toEqual({ success: false, error: 'You cannot approve your own request' });
    expect(own.queries[1].update).not.toHaveBeenCalled();
    expect(settleReportedPayment).not.toHaveBeenCalled();
  });

  it('re-checks the live account: without payments.verify, approvals.approve_reject or the item permission nothing is touched', async () => {
    for (const missing of FULL.permissions) {
      const { from } = client(report());
      createAdminClient.mockReturnValue({ from });
      const result = await service({}, { ...FULL, permissions: FULL.permissions.filter((p) => p !== missing) });
      expect(result).toEqual({ success: false, error: `This needs the ${missing} permission` });
      expect(from).not.toHaveBeenCalled();
    }
    expect(settleReportedPayment).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('reads the live account again in the handler, so a permission removed mid-approval still stops the settlement', async () => {
    const { from, queries } = client(report());
    createAdminClient.mockReturnValue({ from });
    // Releasing the claim after the failed apply is a fourth query.
    from.mockReturnValueOnce(createQuery({ data: null, error: null }));
    const loadReviewer = vi.fn().mockResolvedValueOnce(FULL).mockResolvedValue({ ...FULL, permissions: ['approvals.approve_reject'] });
    const result = await service({ loadReviewer });
    expect(result.success).toBe(false);
    expect(result.error).toContain('payments.verify');
    expect(settleReportedPayment).not.toHaveBeenCalled();
    expect(queries[2].update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', reviewed_by: null }));
  });

  it('decides only the request type it was asked for', async () => {
    const { from, queries } = client(report({ request_type: 'house_plots_change' }));
    createAdminClient.mockReturnValue({ from });
    expect(await service()).toEqual({ success: false, error: 'Request not found' });
    expect(queries[1].update).not.toHaveBeenCalled();
  });

  it('rejects through the same path as the dashboard reject, audited with the channel', async () => {
    const dashboard = client(report());
    createServerSupabaseClient.mockResolvedValue({ from: dashboard.from });
    expect((await rejectRequest('req-1')).success).toBe(true);

    const whatsapp = client(report());
    createAdminClient.mockReturnValue({ from: whatsapp.from });
    expect((await service({ decision: 'reject' })).success).toBe(true);

    expect(written(whatsapp.queries, recordAudit.mock.calls)).toEqual(written(dashboard.queries, logAudit.mock.calls));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'REJECT', metadata: { channel: 'whatsapp_admin' } }), { userId: FO });
    expect(settleReportedPayment).not.toHaveBeenCalled();
    expect(notifyRequesterOfOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'rejected', reviewerId: FO }));
  });
});
