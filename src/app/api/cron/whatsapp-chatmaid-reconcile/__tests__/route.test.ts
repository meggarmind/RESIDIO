import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
import { resolveWhatsAppConfig } from '@/lib/whatsapp';
import { reconcileChatmaidInbound } from '@/lib/whatsapp/providers/chatmaid-reconcile';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/whatsapp', () => ({ resolveWhatsAppConfig: vi.fn() }));
vi.mock('@/lib/whatsapp/providers/chatmaid-reconcile', () => ({ reconcileChatmaidInbound: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const SECRET = 'cron-secret-for-tests';
const chatmaid = { provider: 'chatmaid' as const, apiKey: 'sk_live_secret_key', webhookSecret: 'w', fromNumber: '+15550001111', baseUrl: 'https://chatmaid.test' };
const summary = { checked: 4, alreadyHandled: 3, replayed: 1, ignored: 0, paused: 0, pages: 1, truncated: false };

function request(authorization?: string): NextRequest {
  return new NextRequest('https://residio.test/api/cron/whatsapp-chatmaid-reconcile', {
    headers: authorization ? { authorization } : {},
  });
}

describe('GET /api/cron/whatsapp-chatmaid-reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'ok', config: chatmaid });
    vi.mocked(reconcileChatmaidInbound).mockResolvedValue({ ok: true, summary });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 without the cron secret and reconciles nothing', async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('Bearer not-the-secret-xxxxx'))).status).toBe(401);
    expect(resolveWhatsAppConfig).not.toHaveBeenCalled();
    expect(reconcileChatmaidInbound).not.toHaveBeenCalled();
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('reconciles with the stored Chatmaid config and logs checked, handled and replayed', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, ...summary });
    expect(reconcileChatmaidInbound).toHaveBeenCalledWith(chatmaid);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cron:whatsapp-chatmaid-reconcile', action: 'reconcile', outcome: 'success', summary })
    );
  });

  it('never puts the API key in the log row', async () => {
    await GET(request(`Bearer ${SECRET}`));
    expect(JSON.stringify(vi.mocked(recordSystemAction).mock.calls)).not.toContain('sk_live_secret_key');
  });

  it('skips quietly when the estate is not on Chatmaid', async () => {
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'unconfigured' });

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(reconcileChatmaidInbound).not.toHaveBeenCalled();
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success', summary: { skipped: 'chatmaid_not_configured' } }));
  });

  it('fails with 503 when the stored credentials are unreadable', async () => {
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'unusable', reason: 'decrypt failed' });

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(503);
    expect(reconcileChatmaidInbound).not.toHaveBeenCalled();
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure' }));
  });

  it('returns 500 and logs a failure when a batch could not be processed', async () => {
    vi.mocked(reconcileChatmaidInbound).mockResolvedValue({ ok: false, summary, error: 'Inbound WhatsApp message could not be processed' });

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure', summary }));
  });

  it('returns 500 and logs a failure when Chatmaid cannot be reached', async () => {
    vi.mocked(reconcileChatmaidInbound).mockRejectedValue(new Error('Chatmaid inbound list failed (HTTP 502)'));

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Chatmaid inbound list failed (HTTP 502)' });
    expect(recordSystemAction).toHaveBeenCalledWith(expect.objectContaining({ source: 'cron:whatsapp-chatmaid-reconcile', outcome: 'failure' }));
  });
});
