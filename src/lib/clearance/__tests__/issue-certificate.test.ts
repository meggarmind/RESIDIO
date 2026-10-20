import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import { loadRecipientGroups, type RecipientGroup } from '@/lib/groups/recipient-groups';
import { sendWhatsAppToResident } from '@/lib/whatsapp/resident-send';
import { copyMessage, issueClearanceCertificate, retryClearanceCopy } from '@/lib/clearance/issue-certificate';
import type { ClearanceCertificate } from '@/actions/residents/move-out-renter';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-certificate')) }));
vi.mock('@/lib/pdf/clearance-certificate', () => ({ ClearanceCertificatePDF: vi.fn(() => null) }));
vi.mock('@/lib/settings/service', () => ({ getRawSettingsAsService: vi.fn() }));
vi.mock('@/lib/groups/recipient-groups', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/groups/recipient-groups')>()),
  loadRecipientGroups: vi.fn(),
}));
vi.mock('@/lib/whatsapp/resident-send', () => ({ sendWhatsAppToResident: vi.fn() }));

import { getRawSettingsAsService } from '@/lib/settings/service';

type Call = { table: string; op: string; args: unknown[] };

function mockDb(results: Record<string, unknown[]>, storage: { upload?: unknown; remove?: unknown } = {}) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'insert', 'upsert', 'update', 'eq']) {
      chain[op] = vi.fn((...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      });
    }
    const next = () => (results[table] || []).shift() ?? { data: null, error: null };
    chain.single = vi.fn(() => Promise.resolve(next()));
    chain.maybeSingle = vi.fn(() => Promise.resolve(next()));
    chain.then = (resolve: (value: unknown) => unknown) => resolve(next());
    return chain;
  });
  const bucket = {
    upload: storage.upload ?? vi.fn().mockResolvedValue({ error: null }),
    remove: storage.remove ?? vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed/certificate.pdf' }, error: null }),
  };
  const storageFrom = vi.fn().mockReturnValue(bucket);
  vi.mocked(createAdminClient).mockReturnValue({ from, storage: { from: storageFrom } } as unknown as ReturnType<typeof createAdminClient>);
  return { calls, bucket, storageFrom };
}

const certificate: ClearanceCertificate = {
  id: 'cert-1',
  residentId: 'resident-1',
  residentName: 'Ada Example',
  residentCode: 'RES001',
  houseId: 'house-1',
  houseAddress: '12 Palm Close',
  clearanceDate: '2026-10-12',
  validUntil: '2026-10-12',
  validityDays: 0,
  destination: 'leaving_estate',
  certificateNumber: 'CLR-202610-3F9A1C',
  status: 'confirmed',
  createdBy: 'admin-1',
  createdAt: '2026-10-12T10:00:00Z',
};

function member(residentId: string, over: Partial<RecipientGroup['members'][number]> = {}) {
  return { residentId, name: `Member ${residentId}`, inactive: false, warning: null, ...over };
}

function group(members: RecipientGroup['members']): { data: RecipientGroup[]; error: null } {
  return { data: [{ id: 'group-1', name: 'Estate officials', description: null, members, usedBy: [] }], error: null };
}

const documentsOk = () => ({
  documents: [{ data: null, error: null }, { data: { id: 'doc-1', title: 'Clearance certificate CLR-202610-3F9A1C' }, error: null }],
  document_categories: [{ data: { id: 'category-1' }, error: null }],
});

beforeEach(() => {
  vi.mocked(logAudit).mockClear();
  vi.mocked(sendWhatsAppToResident).mockReset().mockResolvedValue({ sent: true });
  vi.mocked(loadRecipientGroups).mockReset().mockResolvedValue(group([]));
  vi.mocked(getRawSettingsAsService).mockReset().mockResolvedValue({ status: 'ok', values: new Map([['estate_name', 'Palm Estate'], ['clearance_copy_recipient_group_id', 'group-1']]) } as never);
});

describe('issueClearanceCertificate (#816 decisions 20-22)', () => {
  it('saves the PDF to the private documents store with the house, category and uploader, and audits it', async () => {
    const { calls, bucket, storageFrom } = mockDb(documentsOk());

    const issued = await issueClearanceCertificate({ certificate, variant: 'financial', issuedBy: 'admin-1' });

    expect(issued).toMatchObject({ documentId: 'doc-1', filePath: 'clearance-certificates/CLR-202610-3F9A1C.pdf', alreadyIssued: false });
    expect(issued.pdf.toString()).toBe('%PDF-certificate');
    expect(storageFrom).toHaveBeenCalledWith('documents');
    expect(bucket.upload).toHaveBeenCalledWith('clearance-certificates/CLR-202610-3F9A1C.pdf', expect.any(Uint8Array), { contentType: 'application/pdf', upsert: false });
    const insert = calls.find((call) => call.table === 'documents' && call.op === 'insert')!.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({
      title: 'Clearance certificate CLR-202610-3F9A1C',
      file_path: 'clearance-certificates/CLR-202610-3F9A1C.pdf',
      mime_type: 'application/pdf',
      category_id: 'category-1',
      house_id: 'house-1',
      resident_id: 'resident-1',
      uploaded_by: 'admin-1',
    });
    expect(calls).toContainEqual({ table: 'document_categories', op: 'eq', args: ['name', 'Clearance certificates'] });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'documents', entityId: 'doc-1' }));
  });

  it('issues a number only once: a second call saves nothing and sends no copies', async () => {
    const { bucket } = mockDb({ documents: [{ data: { id: 'doc-1' }, error: null }] });
    vi.mocked(loadRecipientGroups).mockResolvedValue(group([member('official-1')]));

    const issued = await issueClearanceCertificate({ certificate, variant: 'financial', issuedBy: 'admin-1' });

    expect(issued).toMatchObject({ documentId: 'doc-1', alreadyIssued: true });
    expect(bucket.upload).not.toHaveBeenCalled();
    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('removes the uploaded file when the document row cannot be saved', async () => {
    const { bucket } = mockDb({ ...documentsOk(), documents: [{ data: null, error: null }, { data: null, error: { message: 'fk violation' } }] });

    await expect(issueClearanceCertificate({ certificate, variant: 'financial', issuedBy: 'admin-1' })).rejects.toThrow('Certificate document not saved: fk violation');
    expect(bucket.remove).toHaveBeenCalledWith(['clearance-certificates/CLR-202610-3F9A1C.pdf']);
    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
  });

  it('saves no document when the upload fails', async () => {
    const { calls } = mockDb(documentsOk(), { upload: vi.fn().mockResolvedValue({ error: { message: 'bucket missing' } }) });
    await expect(issueClearanceCertificate({ certificate, variant: 'financial', issuedBy: 'admin-1' })).rejects.toThrow('Certificate upload failed: bucket missing');
    expect(calls.some((call) => call.op === 'insert')).toBe(false);
  });
});

describe('clearance certificate copies (#816 decisions 18-21, 24)', () => {
  const issue = () => issueClearanceCertificate({ certificate, variant: 'move_out', issuedBy: 'admin-1' });

  it('sends each member the one-line message with the PDF attached, and records it', async () => {
    const { calls } = mockDb({ ...documentsOk(), clearance_certificate_copies: [{ data: null, error: null }, { error: null }, { data: null, error: null }, { error: null }] });
    vi.mocked(loadRecipientGroups).mockResolvedValue(group([member('official-1'), member('official-2')]));

    await issue();

    const body = 'Clearance certificate issued: Ada Example, 12 Palm Close, 12 Oct 2026.';
    expect(sendWhatsAppToResident).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppToResident).toHaveBeenCalledWith('official-1', body, { seed: 'clearance-copy:doc-1:official-1', mediaUrls: ['https://storage.test/signed/certificate.pdf'] });
    expect(sendWhatsAppToResident).toHaveBeenCalledWith('official-2', body, expect.objectContaining({ mediaUrls: ['https://storage.test/signed/certificate.pdf'] }));
    const upserts = calls.filter((call) => call.op === 'upsert').map((call) => call.args[0]);
    expect(upserts).toEqual([
      expect.objectContaining({ document_id: 'doc-1', recipient_resident_id: 'official-1', status: 'sent', error: null, body, attempts: 1 }),
      expect.objectContaining({ document_id: 'doc-1', recipient_resident_id: 'official-2', status: 'sent', error: null, body, attempts: 1 }),
    ]);
  });

  it('logs a member who cannot receive as failed with the reason, without sending, and skips one who has moved out', async () => {
    const { calls } = mockDb({ ...documentsOk(), clearance_certificate_copies: [{ data: null, error: null }, { error: null }] });
    vi.mocked(loadRecipientGroups).mockResolvedValue(group([member('official-1', { warning: 'not opted in' }), member('official-2', { inactive: true, warning: 'moved out' })]));

    await issue();

    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
    const upserts = calls.filter((call) => call.op === 'upsert').map((call) => call.args[0]);
    expect(upserts).toEqual([expect.objectContaining({ recipient_resident_id: 'official-1', status: 'failed', error: 'not opted in' })]);
  });

  it('keeps going and still issues the certificate when one copy fails', async () => {
    const { calls } = mockDb({ ...documentsOk(), clearance_certificate_copies: [{ data: null, error: null }, { error: null }, { data: null, error: null }, { error: null }] });
    vi.mocked(loadRecipientGroups).mockResolvedValue(group([member('official-1'), member('official-2')]));
    vi.mocked(sendWhatsAppToResident).mockResolvedValueOnce({ sent: false, reason: 'provider down' }).mockResolvedValueOnce({ sent: true });

    const issued = await issue();

    expect(issued.alreadyIssued).toBe(false);
    const upserts = calls.filter((call) => call.op === 'upsert').map((call) => call.args[0]);
    expect(upserts).toEqual([
      expect.objectContaining({ recipient_resident_id: 'official-1', status: 'failed', error: 'provider down' }),
      expect.objectContaining({ recipient_resident_id: 'official-2', status: 'sent' }),
    ]);
  });

  it('does not fail the certificate when the recipient group cannot be loaded', async () => {
    mockDb(documentsOk());
    vi.mocked(loadRecipientGroups).mockResolvedValue({ data: [], error: 'timeout' });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(issue()).resolves.toMatchObject({ documentId: 'doc-1' });
    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
  });

  it.each([
    ['no group is selected', new Map([['clearance_copy_recipient_group_id', '']])],
    ['the setting is absent', new Map()],
  ])('sends no copies when %s', async (_label, values) => {
    mockDb(documentsOk());
    vi.mocked(getRawSettingsAsService).mockResolvedValue({ status: 'ok', values } as never);
    vi.mocked(loadRecipientGroups).mockResolvedValue(group([member('official-1')]));

    await issue();
    expect(loadRecipientGroups).not.toHaveBeenCalled();
    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
  });

  it('sends no copies when the selected group no longer exists', async () => {
    mockDb(documentsOk());
    vi.mocked(getRawSettingsAsService).mockResolvedValue({ status: 'ok', values: new Map([['clearance_copy_recipient_group_id', 'gone']]) } as never);
    vi.mocked(loadRecipientGroups).mockResolvedValue(group([member('official-1')]));
    await issue();
    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
  });

  it('words the message with the certificate\'s resident, property and date', () => {
    expect(copyMessage(certificate)).toBe('Clearance certificate issued: Ada Example, 12 Palm Close, 12 Oct 2026.');
  });
});

describe('retryClearanceCopy (#816 decision 24)', () => {
  const failed = { document_id: 'doc-1', recipient_resident_id: 'official-1', body: 'Clearance certificate issued: Ada Example, 12 Palm Close, 12 Oct 2026.', status: 'failed', document: { file_path: 'clearance-certificates/CLR-1.pdf' } };

  it('sends a failed copy again with a fresh signed URL and records the new outcome', async () => {
    const { calls, bucket } = mockDb({ clearance_certificate_copies: [{ data: failed, error: null }, { data: { attempts: 1 }, error: null }, { error: null }] });

    expect(await retryClearanceCopy('copy-1')).toEqual({ sent: true });

    expect(bucket.createSignedUrl).toHaveBeenCalledWith('clearance-certificates/CLR-1.pdf', 3600);
    expect(sendWhatsAppToResident).toHaveBeenCalledWith('official-1', failed.body, expect.objectContaining({ mediaUrls: ['https://storage.test/signed/certificate.pdf'] }));
    expect(calls.find((call) => call.op === 'upsert')!.args[0]).toMatchObject({ status: 'sent', error: null, attempts: 2 });
  });

  it('records a second failure and reports the reason', async () => {
    const { calls } = mockDb({ clearance_certificate_copies: [{ data: failed, error: null }, { data: { attempts: 1 }, error: null }, { error: null }] });
    vi.mocked(sendWhatsAppToResident).mockResolvedValue({ sent: false, reason: 'not opted in' });

    expect(await retryClearanceCopy('copy-1')).toEqual({ sent: false, reason: 'not opted in' });
    expect(calls.find((call) => call.op === 'upsert')!.args[0]).toMatchObject({ status: 'failed', error: 'not opted in', attempts: 2 });
  });

  it('does not resend a copy that was already sent, or one that is missing', async () => {
    mockDb({ clearance_certificate_copies: [{ data: { ...failed, status: 'sent' }, error: null }] });
    expect(await retryClearanceCopy('copy-1')).toEqual({ sent: false, reason: 'copy was already sent' });
    mockDb({ clearance_certificate_copies: [{ data: null, error: null }] });
    expect(await retryClearanceCopy('copy-2')).toEqual({ sent: false, reason: 'copy not found' });
    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
  });
});
