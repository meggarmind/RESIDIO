/** #1455: a receipt sent over WAHA during Report a payment is checked, downloaded and stored privately. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORT_PROOF_MAX_BYTES, reportProofType, storeReportProof, type ReportProofDeps } from '@/lib/whatsapp/report-proof';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/whatsapp/config', () => ({ resolveWhatsAppConfig: vi.fn() }));

const MEDIA_URL = 'http://localhost:3000/api/files/default/ABC.jpeg';

function deps(over: Partial<ReportProofDeps> = {}): ReportProofDeps {
  return {
    loadConfig: vi.fn().mockResolvedValue({ baseUrl: 'https://waha.test', apiKey: 'key' }),
    download: vi.fn().mockResolvedValue({ ok: true, bytes: new Uint8Array([1, 2]) }),
    upload: vi.fn().mockResolvedValue({ error: null }),
    newId: () => 'proof-uuid',
    ...over,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('reportProofType', () => {
  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['application/pdf', 'pdf'],
    ['IMAGE/JPEG; charset=binary', 'jpg'],
  ])('accepts %s', (mimetype, extension) => {
    expect(reportProofType(mimetype)?.extension).toBe(extension);
  });

  it.each(['image/gif', 'audio/ogg', 'video/mp4', 'text/html', 'image/svg+xml', '', null])('refuses %s', (mimetype) => {
    expect(reportProofType(mimetype)).toBeNull();
  });
});

describe('storeReportProof', () => {
  it('downloads at most 5 MB and stores the file under whatsapp/<resident>/<uuid>.<ext>', async () => {
    const d = deps();
    const result = await storeReportProof({ residentId: 'resident-1', media: { url: MEDIA_URL, mimetype: 'image/jpeg' } }, d);

    expect(result).toEqual({ status: 'stored', path: 'whatsapp/resident-1/proof-uuid.jpg' });
    expect(REPORT_PROOF_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(d.download).toHaveBeenCalledWith({ baseUrl: 'https://waha.test', apiKey: 'key' }, MEDIA_URL, REPORT_PROOF_MAX_BYTES);
    expect(d.upload).toHaveBeenCalledWith('whatsapp/resident-1/proof-uuid.jpg', new Uint8Array([1, 2]), 'image/jpeg');
  });

  it('refuses a type that is not a receipt without downloading it', async () => {
    const d = deps();
    expect(await storeReportProof({ residentId: 'resident-1', media: { url: MEDIA_URL, mimetype: 'video/mp4' } }, d)).toEqual({ status: 'unsupported_type' });
    expect(d.download).not.toHaveBeenCalled();
  });

  it('refuses a file over 5 MB and stores nothing', async () => {
    const d = deps({ download: vi.fn().mockResolvedValue({ ok: false, reason: 'too_large' }) });
    expect(await storeReportProof({ residentId: 'resident-1', media: { url: MEDIA_URL, mimetype: 'image/png' } }, d)).toEqual({ status: 'too_large' });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<ReportProofDeps>, string | null]>([
    ['no downloaded file', {}, null],
    ['WAHA not configured', { loadConfig: vi.fn().mockResolvedValue(null) }, MEDIA_URL],
    ['a host outside WAHA', { download: vi.fn().mockResolvedValue({ ok: false, reason: 'not_allowed' }) }, MEDIA_URL],
    ['a failed download', { download: vi.fn().mockResolvedValue({ ok: false, reason: 'download_failed', httpStatus: 500 }) }, MEDIA_URL],
    ['a failed upload', { upload: vi.fn().mockResolvedValue({ error: { message: 'bucket not found' } }) }, MEDIA_URL],
    ['a throw', { loadConfig: vi.fn().mockRejectedValue(new Error('db down')) }, MEDIA_URL],
  ])('gives failed, without throwing, for %s', async (_case, over, url) => {
    const d = deps(over);
    expect(await storeReportProof({ residentId: 'resident-1', media: { url, mimetype: 'image/png' } }, d)).toEqual({ status: 'failed' });
  });

  it('logs the reason only, never the media URL', async () => {
    const download = vi.fn().mockResolvedValue({ ok: false, reason: 'download_failed', httpStatus: 502 });
    await storeReportProof({ residentId: 'resident-1', media: { url: MEDIA_URL, mimetype: 'image/png' } }, deps({ download }));
    const warn = vi.mocked(console.warn);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('api/files');
    expect(warn).toHaveBeenCalledWith(expect.any(String), { reason: 'download_failed', httpStatus: 502 });
  });
});
