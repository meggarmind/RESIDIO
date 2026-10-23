import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import { issueClearanceCertificate } from '@/lib/clearance/issue-certificate';
import { sendWhatsAppToResident } from '@/lib/whatsapp/resident-send';
import { storeChatPdf } from '@/lib/whatsapp/statement-delivery';
import { certificateNumberFor, getOutstanding, issueApprovedClearance } from '@/lib/whatsapp/clearance-approval';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/clearance/issue-certificate', () => ({ issueClearanceCertificate: vi.fn(), DOCUMENTS_BUCKET: 'documents' }));
vi.mock('@/lib/whatsapp/resident-send', () => ({ sendWhatsAppToResident: vi.fn() }));
vi.mock('@/lib/whatsapp/statement-delivery', () => ({ storeChatPdf: vi.fn() }));

function mockDb(results: Record<string, unknown[]>) {
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'eq', 'in']) chain[op] = vi.fn(() => chain);
    const next = () => (results[table] || []).shift() ?? { data: null, error: null };
    chain.maybeSingle = vi.fn(() => Promise.resolve(next()));
    chain.then = (resolve: (value: unknown) => unknown) => resolve(next());
    return chain;
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
}

const NOW = new Date('2026-10-20T10:00:00Z');
const request = { id: '3f9a1c20-0000-4000-8000-000000000000', entity_id: 'house-1', requested_by_resident_id: 'resident-1' };

function db(invoices: Array<{ amount_due: number; amount_paid: number }> = []) {
  mockDb({
    residents: [{ data: { first_name: 'Ada', last_name: 'Example', resident_code: 'RES001', phone_primary: '08000000000' }, error: null }],
    houses: [{ data: { house_number: '12', short_name: null, street: { name: 'Palm Close' } }, error: null }],
    invoices: [{ data: invoices, error: null }],
  });
}

beforeEach(() => {
  vi.mocked(logAudit).mockClear();
  vi.mocked(issueClearanceCertificate).mockReset().mockResolvedValue({ documentId: 'doc-1', filePath: 'clearance-certificates/x.pdf', pdf: Buffer.from('%PDF'), alreadyIssued: false });
  vi.mocked(sendWhatsAppToResident).mockReset().mockResolvedValue({ sent: true });
  vi.mocked(storeChatPdf).mockReset().mockResolvedValue('https://storage.test/signed/clearance.pdf');
});

describe('getOutstanding', () => {
  it('adds up what is still unpaid on the property\'s unpaid and part-paid invoices', async () => {
    db([{ amount_due: 5000, amount_paid: 2000 }, { amount_due: 6000, amount_paid: 0 }, { amount_due: 3000, amount_paid: 3000 }]);
    expect(await getOutstanding('resident-1', 'house-1')).toBe(9000);
  });
});

describe('certificateNumberFor', () => {
  it('is the same for the same request, so a re-applied approval cannot issue twice', () => {
    expect(certificateNumberFor(request.id, NOW)).toBe('CLR-202610-3F9A1C');
    expect(certificateNumberFor(request.id, NOW)).toBe(certificateNumberFor(request.id, new Date('2026-10-21T10:00:00Z')));
  });
});

describe('issueApprovedClearance (#816 decisions 15, 21, 22)', () => {
  it('issues the certificate as the approver, audits it, and sends the PDF to the resident in chat', async () => {
    db();

    const result = await issueApprovedClearance(request, 'admin-1', NOW);

    expect(result).toEqual({ success: true });
    expect(issueClearanceCertificate).toHaveBeenCalledWith({
      certificate: expect.objectContaining({
        residentId: 'resident-1',
        residentName: 'Ada Example',
        residentCode: 'RES001',
        houseId: 'house-1',
        houseAddress: '12, Palm Close',
        clearanceDate: '2026-10-20',
        certificateNumber: 'CLR-202610-3F9A1C',
        status: 'confirmed',
      }),
      variant: 'financial',
      issuedBy: 'admin-1',
    });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'clearance_certificate', metadata: { approval_request_id: request.id } }));
    // The resident's own copy is the 12-hour chat file, separate from the permanent one.
    expect(storeChatPdf).toHaveBeenCalledWith(
      'clearance',
      expect.objectContaining({ residentId: 'resident-1', houseId: 'house-1', label: 'clearance', inboundMessageId: `clearance:${request.id}`, replyText: 'Your clearance certificate for 12, Palm Close is attached.' }),
      expect.any(Function)
    );
    expect(sendWhatsAppToResident).toHaveBeenCalledWith('resident-1', 'Your clearance certificate for 12, Palm Close is attached.', {
      seed: `clearance:${request.id}`,
      mediaUrls: ['https://storage.test/signed/clearance.pdf'],
      trackingId: `clearance:${request.id}`,
      // A held-back copy is re-signed from the permanent file, not the 12-hour chat file (#1044).
      deferMedia: [{ bucket: 'documents', path: 'clearance-certificates/x.pdf' }],
    });
  });

  it('refuses to issue when the resident owes money by the time it is approved', async () => {
    db([{ amount_due: 5000, amount_paid: 0 }]);

    const result = await issueApprovedClearance(request, 'admin-1', NOW);

    expect(result).toEqual({ success: false, error: 'Ada Example now owes ₦5,000.00 on 12, Palm Close. Reject this request, or approve it once it is paid.' });
    expect(issueClearanceCertificate).not.toHaveBeenCalled();
    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
  });

  it('fails without a resident on the request', async () => {
    db();
    expect(await issueApprovedClearance({ ...request, requested_by_resident_id: null }, 'admin-1', NOW)).toMatchObject({ success: false });
    expect(issueClearanceCertificate).not.toHaveBeenCalled();
  });

  it('does nothing more when the certificate number was issued before', async () => {
    db();
    vi.mocked(issueClearanceCertificate).mockResolvedValue({ documentId: 'doc-1', filePath: 'x', pdf: Buffer.alloc(0), alreadyIssued: true });

    expect(await issueApprovedClearance(request, 'admin-1', NOW)).toEqual({ success: true });
    expect(logAudit).not.toHaveBeenCalled();
    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
  });

  it('tells the admin a held-back certificate copy is scheduled, not lost (#1044)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db();
    vi.mocked(sendWhatsAppToResident).mockResolvedValue({ sent: false, deferred: true, reason: 'WhatsApp daily outbound limit reached. It is scheduled and will send automatically after midnight Lagos time' });
    expect(await issueApprovedClearance(request, 'admin-1', NOW)).toEqual({
      success: true,
      warning: 'The certificate was issued, but the WhatsApp copy to the resident is held back: WhatsApp daily outbound limit reached. It is scheduled and will send automatically after midnight Lagos time',
    });
  });

  it('still succeeds when the resident cannot be reached, because the certificate exists', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db();
    vi.mocked(sendWhatsAppToResident).mockResolvedValue({ sent: false, reason: 'WhatsApp daily outbound limit reached' });
    expect(await issueApprovedClearance(request, 'admin-1', NOW)).toEqual({
      success: true,
      warning: 'The certificate was issued, but the WhatsApp copy to the resident was not sent: WhatsApp daily outbound limit reached',
    });

    db();
    vi.mocked(storeChatPdf).mockRejectedValue(new Error('storage down'));
    expect(await issueApprovedClearance(request, 'admin-1', NOW)).toEqual({ success: true });
  });

  it('fails, so the approval can be retried, when the certificate cannot be issued', async () => {
    db();
    vi.mocked(issueClearanceCertificate).mockRejectedValue(new Error('Certificate upload failed'));
    await expect(issueApprovedClearance(request, 'admin-1', NOW)).rejects.toThrow('Certificate upload failed');
  });
});
