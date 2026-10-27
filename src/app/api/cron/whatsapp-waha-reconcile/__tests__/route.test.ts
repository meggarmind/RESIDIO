import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { resolveWhatsAppConfig } from '@/lib/whatsapp';
import { reconcileWahaInbound } from '@/lib/whatsapp/providers/waha-reconcile';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/whatsapp', () => ({ resolveWhatsAppConfig: vi.fn() }));
vi.mock('@/lib/whatsapp/providers/waha-reconcile', () => ({ reconcileWahaInbound: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests'; // secret-scan:allow test fixture
const waha = {
  provider: 'waha' as const,
  apiKey: 'waha-secret-api-key',
  webhookSecret: 'w',
  baseUrl: 'https://waha.test',
  session: 'default',
  fromNumber: '+15550001111',
};
const summary = { checked: 4, alreadyHandled: 3, replayed: 1, ignored: 0, paused: 0, pages: 1, truncated: false };

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/whatsapp-waha-reconcile', {
    headers: authorization ? { authorization } : {},
  });
}

describe('GET /api/cron/whatsapp-waha-reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'ok', config: waha });
    vi.mocked(reconcileWahaInbound).mockResolvedValue({ ok: true, summary });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 without the cron secret and reconciles nothing', async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('Bearer not-the-secret-xxxxx'))).status).toBe(401);
    expect(resolveWhatsAppConfig).not.toHaveBeenCalled();
    expect(reconcileWahaInbound).not.toHaveBeenCalled();
  });

  it('reconciles with the stored WAHA config and logs the summary', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, ...summary });
    expect(reconcileWahaInbound).toHaveBeenCalledWith(waha);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:whatsapp-waha-reconcile', action: 'reconcile', outcome: 'success', summary })
    );
    expect(JSON.stringify(vi.mocked(recordSystemAction).mock.calls)).not.toContain('waha-secret-api-key');
  });

  it('is a no-op when the active provider is not WAHA', async () => {
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({
      status: 'ok',
      config: { provider: 'chatmaid', apiKey: 'k', webhookSecret: 'w', fromNumber: '+15550001111', baseUrl: 'https://c.test' },
    });

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, skipped: 'waha_not_configured' });
    expect(reconcileWahaInbound).not.toHaveBeenCalled();
  });

  it('fails with 503 when the stored credentials are unreadable', async () => {
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'unusable', reason: 'decrypt failed' });

    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(503);
    expect(reconcileWahaInbound).not.toHaveBeenCalled();
  });

  it('returns 500 when WAHA cannot be reached', async () => {
    vi.mocked(reconcileWahaInbound).mockRejectedValue(new Error('WAHA messages list failed (HTTP 502)'));

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }));
  });
});
