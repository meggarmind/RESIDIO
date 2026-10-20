import { beforeEach, describe, expect, it, vi } from 'vitest';

/** #871: notice settings read, office contact line and the signed PDF URL. */
const settings = vi.hoisted(() => ({ result: { status: 'ok', values: new Map<string, unknown>() } as { status: string; values: Map<string, unknown>; message?: string } }));
const storage = vi.hoisted(() => ({ createSignedUrl: vi.fn(), upload: vi.fn() }));

vi.mock('@/lib/settings/service', () => ({ getRawSettingsAsService: vi.fn(async () => settings.result) }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ storage: { from: () => storage } }) }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn(async () => Buffer.from('%PDF')) }));
vi.mock('@/lib/pdf/privacy-notice', () => ({ PrivacyNoticePDF: vi.fn(() => null) }));

import { createWhatsAppPrivacyNoticeUrl, loadEstateOfficeContactLine, loadWhatsAppPrivacyNotice } from '@/lib/whatsapp/privacy-notice';

function withSettings(values: Record<string, unknown>) {
  settings.result = { status: 'ok', values: new Map(Object.entries(values)) };
}

beforeEach(() => {
  storage.createSignedUrl.mockReset();
  storage.upload.mockReset();
});

describe('WhatsApp privacy notice', () => {
  it('returns the notice only when both version and text are set', async () => {
    withSettings({ whatsapp_privacy_notice_version: ' v1 ', whatsapp_privacy_notice_text: 'Text' });
    await expect(loadWhatsAppPrivacyNotice()).resolves.toEqual({ version: 'v1', text: 'Text' });

    withSettings({ whatsapp_privacy_notice_version: 'v1', whatsapp_privacy_notice_text: '  ' });
    await expect(loadWhatsAppPrivacyNotice()).resolves.toBeNull();
  });

  it('fails the message rather than treating a lookup error as "no notice"', async () => {
    settings.result = { status: 'error', values: new Map(), message: 'down' };
    await expect(loadWhatsAppPrivacyNotice()).rejects.toThrow('down');
  });

  it.each([
    [{ estate_phone: '0801', estate_email: 'office@estate.test' }, 'Contact the estate office on 0801 or office@estate.test.'],
    [{ estate_phone: '0801' }, 'Contact the estate office on 0801.'],
    [{ estate_email: 'office@estate.test' }, 'Contact the estate office at office@estate.test.'],
    [{}, ''],
  ])('builds the office contact line from %o', async (values, expected) => {
    withSettings(values);
    await expect(loadEstateOfficeContactLine()).resolves.toBe(expected);
  });

  it('reuses an already-rendered PDF for the same wording', async () => {
    withSettings({});
    storage.createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://signed/existing' }, error: null });

    await expect(createWhatsAppPrivacyNoticeUrl({ version: 'v1', text: 'Text' })).resolves.toBe('https://signed/existing');
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).toHaveBeenCalledWith(expect.stringMatching(/^privacy-notice\/[0-9a-f]{32}\.pdf$/), 3600);
  });

  it('renders and uploads the PDF once when missing, then signs it for one hour', async () => {
    withSettings({});
    storage.createSignedUrl
      .mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://signed/new' }, error: null });
    storage.upload.mockResolvedValueOnce({ error: null });

    await expect(createWhatsAppPrivacyNoticeUrl({ version: 'v1', text: 'Text' })).resolves.toBe('https://signed/new');
    expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/^privacy-notice\//), expect.any(Uint8Array), { contentType: 'application/pdf', upsert: true });
  });

  it('keys the file on the wording, so an edit without a version bump sends the new text', async () => {
    withSettings({});
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null });

    await createWhatsAppPrivacyNoticeUrl({ version: 'v1', text: 'Old' });
    await createWhatsAppPrivacyNoticeUrl({ version: 'v1', text: 'New' });

    expect(storage.createSignedUrl.mock.calls[0][0]).not.toBe(storage.createSignedUrl.mock.calls[1][0]);
  });

  it('throws when the upload fails, so the provider retries the message', async () => {
    withSettings({});
    storage.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    storage.upload.mockResolvedValueOnce({ error: { message: 'bucket missing' } });

    await expect(createWhatsAppPrivacyNoticeUrl({ version: 'v1', text: 'Text' })).rejects.toThrow('bucket missing');
  });
});
