import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/cron/whatsapp-waha-group-sync/route';
import { resolveWhatsAppConfig } from '@/lib/whatsapp';
import { syncEstateGroupMembers } from '@/lib/whatsapp/group-sync';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/whatsapp', () => ({ resolveWhatsAppConfig: vi.fn() }));
vi.mock('@/lib/whatsapp/group-sync', () => ({ syncEstateGroupMembers: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests'; // secret-scan:allow
const waha = {
  provider: 'waha' as const,
  apiKey: 'waha_secret_key',
  webhookSecret: 'w',
  baseUrl: 'https://waha.test',
  session: 'default',
  fromNumber: '+15550001111',
};
const summary = { members: 5, matched: 4, unmatched: 1, unresolved: 0, left: 1, refreshed: true, refreshFailed: false };

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/whatsapp-waha-group-sync', {
    headers: authorization ? { authorization } : {},
  });
}

describe('GET /api/cron/whatsapp-waha-group-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'ok', config: waha });
    vi.mocked(syncEstateGroupMembers).mockResolvedValue({ ok: true, summary });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 without the cron secret and syncs nothing', async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('Bearer not-the-secret-xxxxx'))).status).toBe(401);
    expect(syncEstateGroupMembers).not.toHaveBeenCalled();
  });

  it('syncs with the stored WAHA config and logs the counts', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, ...summary });
    expect(syncEstateGroupMembers).toHaveBeenCalledWith(waha, { onLeave: expect.any(Function) });
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:whatsapp-waha-group-sync', action: 'sync', outcome: 'success', summary })
    );
  });

  it('skips quietly when WAHA is not the active provider', async () => {
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'absent' } as never);
    const response = await GET(request(`Bearer ${SECRET}`));

    await expect(response.json()).resolves.toEqual({ success: true, skipped: 'waha_not_configured' });
    expect(syncEstateGroupMembers).not.toHaveBeenCalled();
  });

  it('returns 500 and logs a failure when the sync reports one or throws', async () => {
    vi.mocked(syncEstateGroupMembers).mockResolvedValueOnce({ ok: false, summary, error: 'empty list' });
    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(500);

    vi.mocked(syncEstateGroupMembers).mockRejectedValueOnce(new Error('WAHA group request failed (HTTP 500)'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'WAHA group request failed (HTTP 500)' });
    expect(recordSystemAction).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'failure' }));
  });
});
