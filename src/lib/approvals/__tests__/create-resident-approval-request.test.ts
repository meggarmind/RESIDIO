import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit/recorder';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { createResidentApprovalRequest } from '@/lib/approvals/create-resident-approval-request';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/recorder', () => ({ recordAudit: vi.fn().mockResolvedValue({ recorded: true }) }));
vi.mock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins: vi.fn().mockResolvedValue({ success: true, count: 1 }) }));

function mockInsert(result: unknown) {
  const insert = vi.fn();
  const chain = { insert, select: vi.fn(), single: vi.fn().mockResolvedValue(result) };
  insert.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn(() => chain) } as unknown as ReturnType<typeof createAdminClient>);
  return insert;
}

const params = {
  residentId: 'resident-1',
  request_type: 'whatsapp_payment_report' as const,
  entity_type: 'payment_record' as const,
  entity_id: 'payment-1',
  requested_changes: { amount: 50000, payment_date: '2026-10-12', property: '12 Palm Close', reference: 'GTB TRF' },
};

beforeEach(() => {
  vi.mocked(recordAudit).mockClear();
  vi.mocked(notifyAdmins).mockClear();
});

describe('createResidentApprovalRequest (#816)', () => {
  it('files the request for the resident with no admin requester, a 72-hour expiry, an audit entry and an admin notification', async () => {
    const insert = mockInsert({ data: { id: 'request-1' }, error: null });

    const result = await createResidentApprovalRequest(params);

    expect(result).toEqual({ success: true, request_id: 'request-1' });
    expect(insert.mock.calls[0][0]).toMatchObject({
      request_type: 'whatsapp_payment_report',
      entity_type: 'payment_record',
      entity_id: 'payment-1',
      requested_by: null,
      requested_by_resident_id: 'resident-1',
      requested_changes: params.requested_changes,
    });
    const expires = Date.parse(insert.mock.calls[0][0].expires_at) - Date.now();
    expect(expires).toBeGreaterThan(71.9 * 3600 * 1000);
    expect(expires).toBeLessThanOrEqual(72 * 3600 * 1000);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'approval_requests', entityId: 'request-1' }), { userId: null, residentId: 'resident-1' });
    expect(notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ actionUrl: '/approvals?id=request-1', requiredPermission: 'approvals.view' }));
  });

  it('refuses a payload the handler schema does not accept, without writing', async () => {
    const insert = mockInsert({ data: { id: 'request-1' }, error: null });
    const result = await createResidentApprovalRequest({ ...params, requested_changes: { amount: -1 } });
    expect(result).toMatchObject({ success: false, duplicate: false });
    expect(insert).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it('refuses a request type the approvals flow does not handle', async () => {
    const insert = mockInsert({ data: { id: 'request-1' }, error: null });
    const result = await createResidentApprovalRequest({ ...params, request_type: 'late_fee_waiver' });
    expect(result).toEqual({ success: false, duplicate: false, error: 'Unsupported approval request type: late_fee_waiver' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('reports a second pending request for the same entity as a duplicate, without audit or notification', async () => {
    mockInsert({ data: null, error: { code: '23505', message: 'duplicate key value' } });
    expect(await createResidentApprovalRequest(params)).toEqual({ success: false, duplicate: true, error: 'duplicate key value' });
    expect(recordAudit).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it('reports any other insert failure as not filed', async () => {
    mockInsert({ data: null, error: { code: '22P02', message: 'invalid input value for enum approval_request_type' } });
    expect(await createResidentApprovalRequest(params)).toMatchObject({ success: false, duplicate: false });
  });
});
