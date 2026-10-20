import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createResidentApprovalRequest } from '@/lib/approvals/create-resident-approval-request';
import { requestClearanceCertificate } from '@/lib/whatsapp/clearance-request';

vi.mock('@/lib/approvals/create-resident-approval-request', () => ({ createResidentApprovalRequest: vi.fn() }));

const input = { residentId: 'resident-1', residentName: 'Ada Example', houseId: 'house-1', houseLabel: '12 Palm Close' };

beforeEach(() => {
  vi.mocked(createResidentApprovalRequest).mockReset();
});

describe('requestClearanceCertificate (#816 decision 15)', () => {
  it('files a request for the property as the resident', async () => {
    vi.mocked(createResidentApprovalRequest).mockResolvedValue({ success: true, request_id: 'request-1' });

    expect(await requestClearanceCertificate(input)).toEqual({ status: 'requested', requestId: 'request-1' });
    expect(createResidentApprovalRequest).toHaveBeenCalledWith({
      residentId: 'resident-1',
      request_type: 'clearance_certificate_request',
      entity_type: 'house',
      entity_id: 'house-1',
      requested_changes: { property: '12 Palm Close', resident: 'Ada Example' },
      reason: 'Requested over WhatsApp',
    });
  });

  it('reports a request already waiting for the property as a duplicate', async () => {
    vi.mocked(createResidentApprovalRequest).mockResolvedValue({ success: false, duplicate: true, error: 'duplicate key' });
    expect(await requestClearanceCertificate(input)).toEqual({ status: 'duplicate' });
  });

  it('throws on any other failure, so the resident is not told it was sent', async () => {
    vi.mocked(createResidentApprovalRequest).mockResolvedValue({ success: false, duplicate: false, error: 'enum value missing' });
    await expect(requestClearanceCertificate(input)).rejects.toThrow('Clearance request not filed: enum value missing');
  });
});
