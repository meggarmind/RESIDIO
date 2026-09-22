import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedMessageStore } from '@/lib/whatsapp/types';

const chatmaidConfig = {
  provider: 'chatmaid' as const,
  apiKey: 'sk_test_unused',
  webhookSecret: 'whsec_route_test',
  fromNumber: '+15550001111',
  baseUrl: 'https://developers-api.chatmaid.net',
};

const url = 'https://residio.test/api/whatsapp/webhook/chatmaid';
const NOW = Date.parse('2026-09-22T12:00:00.000Z');

/** Independent implementation of the documented `t=<s>,v1=hmac(t.body)` scheme. */
function sign(body: string, secret = chatmaidConfig.webhookSecret, t = Math.floor(NOW / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex');
  return `t=${t},v1=${v1}`;
}

function post(event: string | null, body: string, signature: string | null = sign(body)): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (event) headers['x-chatmaid-event'] = event;
  if (signature) headers['x-chatmaid-signature'] = signature;
  return new NextRequest(url, { method: 'POST', headers, body });
}

const receivedBody = JSON.stringify({
  event: 'message.received',
  timestamp: '2026-09-22T11:59:59.000Z',
  data: {
    messageId: 'inmsg_route_1',
    from: '+2348000000000',
    to: '+15550001111',
    content: 'balance',
    type: 'text',
  },
});

const disconnectedBody = JSON.stringify({
  event: 'phone.disconnected',
  timestamp: '2026-09-22T11:59:00.000Z',
  data: { phoneNumber: '+15550001111' },
});

interface Harness {
  handleResidentMessage: ReturnType<typeof vi.fn>;
  notifyAdmins: ReturnType<typeof vi.fn>;
  getPausedUntil: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  store: ProcessedMessageStore;
  POST: (request: NextRequest) => Promise<Response>;
}

async function load(options: {
  config?: unknown;
  pausedUntil?: Date | null;
  handleResidentMessage?: ReturnType<typeof vi.fn>;
  notifyResult?: { success: boolean; count: number; error?: string };
} = {}): Promise<Harness> {
  vi.doMock('@/lib/whatsapp/config-db', () => ({
    loadWhatsAppConfigFromDb: vi
      .fn()
      .mockResolvedValue(options.config ?? { status: 'ok', config: chatmaidConfig }),
  }));

  const handleResidentMessage = options.handleResidentMessage ?? vi.fn().mockResolvedValue(undefined);
  const inbound = await vi.importActual<typeof import('@/lib/whatsapp/inbound')>('@/lib/whatsapp/inbound');
  // One in-memory store shared by every call in the test, standing in for
  // the `whatsapp_processed_messages` table, so a retried request sees the
  // first one's claim.
  const store = inbound.createInMemoryProcessedMessageStore();

  vi.doMock('@/lib/whatsapp', async () => ({
    ...(await vi.importActual<typeof import('@/lib/whatsapp')>('@/lib/whatsapp')),
    createSupabaseProcessedMessageStore: () => store,
    createSupabaseWhatsAppIdentityRepository: () => ({}),
    createSupabaseWhatsAppFinancialRepository: () => ({}),
    handleResidentMessage,
  }));

  const getPausedUntil = vi.fn().mockResolvedValue(options.pausedUntil ?? null);
  const pause = vi.fn().mockResolvedValue(undefined);
  vi.doMock('@/lib/whatsapp/providers/chatmaid-inbound', async () => ({
    ...(await vi.importActual<typeof import('@/lib/whatsapp/providers/chatmaid-inbound')>(
      '@/lib/whatsapp/providers/chatmaid-inbound'
    )),
    createSupabaseChatmaidSessionPauseStore: () => ({ getPausedUntil, pause }),
  }));

  const notifyAdmins = vi.fn().mockResolvedValue(options.notifyResult ?? { success: true, count: 2 });
  vi.doMock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins }));

  const { POST } = await import('@/app/api/whatsapp/webhook/chatmaid/route');
  return { handleResidentMessage, notifyAdmins, getPausedUntil, pause, store, POST };
}

describe('Chatmaid WhatsApp webhook route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('@/lib/whatsapp');
    vi.doUnmock('@/lib/whatsapp/providers/chatmaid-inbound');
    vi.doUnmock('@/lib/notifications/admin-notifier');
  });

  it('returns 503 with the reason when stored credentials are unusable', async () => {
    const h = await load({ config: { status: 'unusable', reason: 'decryption failed' } });
    const response = await h.POST(post('message.received', receivedBody));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('decryption failed') });
  }, 15_000);

  it('returns 503 when no provider is configured', async () => {
    const h = await load({ config: { status: 'absent' } });
    expect((await h.POST(post('message.received', receivedBody))).status).toBe(503);
  });

  it('returns 503 when the active provider is not chatmaid', async () => {
    const h = await load({
      config: {
        status: 'ok',
        config: { provider: 'twilio', accountSid: 'AC', authToken: 't', fromNumber: '+1', templateContentSids: {} },
      },
    });
    expect((await h.POST(post('message.received', receivedBody))).status).toBe(503);
    expect(h.handleResidentMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['missing signature', null],
    ['wrong secret', sign(receivedBody, 'not-the-secret')],
    ['stale timestamp', sign(receivedBody, chatmaidConfig.webhookSecret, Math.floor(NOW / 1000) - 301)],
  ])('rejects %s with 401 before any processing', async (_label, signature) => {
    const h = await load();
    const response = await h.POST(post('phone.disconnected', disconnectedBody, signature));

    expect(response.status).toBe(401);
    expect(h.notifyAdmins).not.toHaveBeenCalled();
    expect(h.handleResidentMessage).not.toHaveBeenCalled();
    expect(h.pause).not.toHaveBeenCalled();
    expect(h.getPausedUntil).not.toHaveBeenCalled();
  });

  it('rejects an unparseable body with 401 when unsigned, before trying to parse it', async () => {
    const h = await load();
    const response = await h.POST(post('message.received', '{not json', 'garbage'));
    expect(response.status).toBe(401);
  });

  it('processes message.received through the resident handler chain', async () => {
    const h = await load();
    const response = await h.POST(post('message.received', receivedBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ processed: true, processed_count: 1, ignored_count: 0 });
    expect(h.getPausedUntil).toHaveBeenCalledWith('+2348000000000');
    expect(h.handleResidentMessage).toHaveBeenCalledTimes(1);
    expect(h.handleResidentMessage.mock.calls[0][0]).toMatchObject({
      id: 'inmsg_route_1',
      from: '+2348000000000',
      text: 'balance',
    });
  });

  it('does not answer a retried message.received twice', async () => {
    const h = await load();
    await h.POST(post('message.received', receivedBody));
    const retry = await h.POST(post('message.received', receivedBody));

    await expect(retry.json()).resolves.toMatchObject({ duplicate_count: 1 });
    expect(h.handleResidentMessage).toHaveBeenCalledTimes(1);
  });

  it('does not reply while the conversation is paused for a human takeover', async () => {
    const h = await load({ pausedUntil: new Date(NOW + 60_000) });
    const response = await h.POST(post('message.received', receivedBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ processed_count: 1, ignored_count: 1, paused_count: 1 });
    expect(h.handleResidentMessage).not.toHaveBeenCalled();
  });

  it('replies again once the pause has lapsed', async () => {
    const h = await load({ pausedUntil: new Date(NOW - 1) });
    await h.POST(post('message.received', receivedBody));
    expect(h.handleResidentMessage).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when processing fails, and lets the retry process the message', async () => {
    const failing = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined);
    const h = await load({ handleResidentMessage: failing });

    const first = await h.POST(post('message.received', receivedBody));
    expect(first.status).toBe(500);

    const retry = await h.POST(post('message.received', receivedBody));
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ processed_count: 1, duplicate_count: 0 });
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('pauses the recipient conversation for 30 minutes on message.outgoing', async () => {
    const h = await load();
    const body = JSON.stringify({
      event: 'message.outgoing',
      timestamp: '2026-09-22T11:59:59.000Z',
      data: { from: '+15550001111', to: '+2348000000000', source: 'manual' },
    });

    const response = await h.POST(post('message.outgoing', body));

    expect(response.status).toBe(200);
    expect(h.pause).toHaveBeenCalledTimes(1);
    expect(h.pause).toHaveBeenCalledWith('+2348000000000', new Date(NOW + 30 * 60 * 1000));
    expect(h.handleResidentMessage).not.toHaveBeenCalled();
  });

  it('returns 500 when the pause cannot be recorded, so Chatmaid retries', async () => {
    const h = await load();
    h.pause.mockRejectedValueOnce(new Error('db down'));
    const body = JSON.stringify({ event: 'message.outgoing', data: { to: '+2348000000000' } });

    expect((await h.POST(post('message.outgoing', body))).status).toBe(500);
  });

  it('raises one urgent system alert on phone.disconnected, and none for a retried delivery', async () => {
    const h = await load();

    const first = await h.POST(post('phone.disconnected', disconnectedBody));
    const retry = await h.POST(post('phone.disconnected', disconnectedBody));

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(h.notifyAdmins).toHaveBeenCalledTimes(1);
    const alert = h.notifyAdmins.mock.calls[0][0];
    expect(alert).toMatchObject({ priority: 'urgent', category: 'system' });
    expect(alert.body).toMatch(/permanently lost/);
    expect(alert.body).toMatch(/fallback channel/);
  });

  it('returns 500 and releases the claim when the alert cannot be sent, so the retry alerts', async () => {
    const h = await load({ notifyResult: { success: false, count: 0, error: 'insert failed' } });

    expect((await h.POST(post('phone.disconnected', disconnectedBody))).status).toBe(500);

    h.notifyAdmins.mockResolvedValue({ success: true, count: 1 });
    expect((await h.POST(post('phone.disconnected', disconnectedBody))).status).toBe(200);
    expect(h.notifyAdmins).toHaveBeenCalledTimes(2);
  });

  it('sends a normal-priority recovery notice on phone.connected', async () => {
    const h = await load();
    const body = JSON.stringify({ event: 'phone.connected', timestamp: '2026-09-22T11:59:30.000Z', data: {} });

    expect((await h.POST(post('phone.connected', body))).status).toBe(200);
    expect(h.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(h.notifyAdmins.mock.calls[0][0]).toMatchObject({ priority: 'normal', category: 'system' });
  });

  it.each(['message.delivered', 'message.read', 'message.failed', 'something.new', null])(
    'acknowledges %s with 200 and does nothing else',
    async (event) => {
      const h = await load();
      const body = JSON.stringify({ event, data: { messageId: 'msg_1', status: 'delivered' } });
      const response = await h.POST(post(event, body));

      expect(response.status).toBe(200);
      expect(h.notifyAdmins).not.toHaveBeenCalled();
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
      expect(h.pause).not.toHaveBeenCalled();
    }
  );
});
