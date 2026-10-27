import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedMessageStore } from '@/lib/whatsapp/types';

const wahaConfig = {
  provider: 'waha' as const,
  apiKey: 'waha-unused',
  webhookSecret: 'waha_route_secret',
  baseUrl: 'https://waha.test',
  session: 'default',
  fromNumber: '+15550001111',
};

const recordSystemAction = vi.fn();
const url = 'https://residio.test/api/whatsapp/webhook/waha';
const NOW = Date.parse('2026-10-27T12:00:00.000Z');

/** Independent implementation of WAHA's scheme: hex HMAC-SHA512 of the raw body. */
function sign(body: string, secret = wahaConfig.webhookSecret): string {
  return createHmac('sha512', secret).update(body, 'utf8').digest('hex');
}

function post(body: string, options: { hmac?: string | null; algorithm?: string; requestId?: string; length?: string } = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const hmac = options.hmac === undefined ? sign(body) : options.hmac;
  if (hmac) headers['x-webhook-hmac'] = hmac;
  headers['x-webhook-hmac-algorithm'] = options.algorithm ?? 'sha512';
  if (options.requestId) headers['x-webhook-request-id'] = options.requestId;
  if (options.length) headers['content-length'] = options.length;
  return new NextRequest(url, { method: 'POST', headers, body });
}

function wahaEvent(event: string, payload: Record<string, unknown>, timestamp = NOW) {
  return JSON.stringify({ id: `evt_${event}`, timestamp, event, session: 'default', payload });
}

const messageBody = wahaEvent('message', {
  id: 'false_2348000000000@c.us_IN1',
  timestamp: Math.floor(NOW / 1000),
  from: '2348000000000@c.us',
  fromMe: false,
  body: 'balance',
  hasMedia: false,
});

const ackBody = (ack: number, overrides: Record<string, unknown> = {}, timestamp = NOW) =>
  wahaEvent('message.ack', { id: 'true_2348000000000@c.us_OUT1', fromMe: true, ack, ...overrides }, timestamp);

async function load(options: {
  config?: unknown;
  pausedUntil?: Date | null;
  sendMatched?: boolean;
  sendExists?: boolean;
  recentFailures?: number;
} = {}) {
  vi.doMock('@/lib/whatsapp/config-db', () => ({
    loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue(options.config ?? { status: 'ok', config: wahaConfig }),
  }));

  const handleResidentMessage = vi.fn().mockResolvedValue(undefined);
  const inbound = await vi.importActual<typeof import('@/lib/whatsapp/inbound')>('@/lib/whatsapp/inbound');
  const store: ProcessedMessageStore = inbound.createInMemoryProcessedMessageStore();

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

  const notifyAdmins = vi.fn().mockResolvedValue({ success: true, count: 2 });
  vi.doMock('@/lib/notifications/admin-notifier', () => ({ notifyAdmins }));
  vi.doMock('@/lib/system-log/recorder', () => ({ recordSystemAction }));

  const updateOutboundSendStatus = vi.fn().mockResolvedValue(options.sendMatched ?? true);
  const outboundSendExists = vi.fn().mockResolvedValue(options.sendExists ?? true);
  const countRecentOutboundFailures = vi.fn().mockResolvedValue(options.recentFailures ?? 1);
  vi.doMock('@/lib/whatsapp/outbound-sends', async () => ({
    ...(await vi.importActual<typeof import('@/lib/whatsapp/outbound-sends')>('@/lib/whatsapp/outbound-sends')),
    updateOutboundSendStatus,
    outboundSendExists,
    countRecentOutboundFailures,
  }));

  const retryFailedStatementSend = vi.fn().mockResolvedValue(false);
  vi.doMock('@/lib/whatsapp/statement-delivery', () => ({ retryFailedStatementSend }));

  const { POST } = await import('@/app/api/whatsapp/webhook/waha/route');
  return { handleResidentMessage, notifyAdmins, pause, updateOutboundSendStatus, retryFailedStatementSend, POST };
}

describe('WAHA WhatsApp webhook route', () => {
  beforeEach(() => {
    vi.resetModules();
    recordSystemAction.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('@/lib/whatsapp');
    vi.doUnmock('@/lib/whatsapp/config-db');
    vi.doUnmock('@/lib/whatsapp/providers/chatmaid-inbound');
    vi.doUnmock('@/lib/notifications/admin-notifier');
    vi.doUnmock('@/lib/system-log/recorder');
    vi.doUnmock('@/lib/whatsapp/outbound-sends');
    vi.doUnmock('@/lib/whatsapp/statement-delivery');
  });

  it('returns 503 when the active provider is not WAHA, or credentials are unusable', async () => {
    let h = await load({ config: { status: 'ok', config: { provider: 'chatmaid', apiKey: 'k', webhookSecret: wahaConfig.webhookSecret, fromNumber: '+1', baseUrl: 'x' } } });
    expect((await h.POST(post(messageBody))).status).toBe(503);
    expect(h.handleResidentMessage).not.toHaveBeenCalled();

    vi.resetModules();
    h = await load({ config: { status: 'unusable', reason: 'decryption failed' } });
    expect((await h.POST(post(messageBody))).status).toBe(503);
  }, 15_000);

  it('returns 413 for a body over 256 KB, declared or actual', async () => {
    const h = await load();
    expect((await h.POST(post(messageBody, { length: String(300 * 1024) }))).status).toBe(413);
    const big = JSON.stringify({ event: 'message', pad: 'x'.repeat(260 * 1024) });
    expect((await h.POST(post(big))).status).toBe(413);
  });

  it.each([
    ['a missing signature', { hmac: null }],
    ['a wrong secret', { hmac: sign(messageBody, 'other') }],
    ['the wrong algorithm', { algorithm: 'sha256' }],
  ])('rejects %s with 401 before any processing', async (_label, options) => {
    const h = await load();
    const response = await h.POST(post(messageBody, options));
    expect(response.status).toBe(401);
    expect(h.handleResidentMessage).not.toHaveBeenCalled();
  });

  it('answers a message through the resident handler, and a duplicate only once', async () => {
    const h = await load();
    expect((await h.POST(post(messageBody))).status).toBe(200);
    const second = await h.POST(post(messageBody));
    await expect(second.json()).resolves.toMatchObject({ duplicate_count: 1 });
    expect(h.handleResidentMessage).toHaveBeenCalledTimes(1);
    expect(h.handleResidentMessage.mock.calls[0][0]).toMatchObject({ from: '+2348000000000', text: 'balance' });
  });

  it('answers message.any from a resident like message', async () => {
    const h = await load();
    const body = wahaEvent('message.any', { id: 'any1', timestamp: 1, from: '2348000000000@c.us', fromMe: false, body: 'hi' });
    expect((await h.POST(post(body))).status).toBe(200);
    expect(h.handleResidentMessage).toHaveBeenCalledTimes(1);
  });

  it('pauses the Assistant when an admin types on the handset, not for API echoes', async () => {
    const h = await load();
    const manual = wahaEvent('message.any', { id: 'o1', fromMe: true, source: 'app', to: '2348000000000@c.us' });
    expect((await h.POST(post(manual))).status).toBe(200);
    expect(h.pause).toHaveBeenCalledWith('+2348000000000', new Date(NOW + 30 * 60 * 1000));

    const echo = wahaEvent('message.any', { id: 'o2', fromMe: true, source: 'api', to: '2348000000000@c.us' });
    await expect((await h.POST(post(echo))).json()).resolves.toMatchObject({ ignored: 'not_manual' });
    expect(h.pause).toHaveBeenCalledTimes(1);
    expect(h.handleResidentMessage).not.toHaveBeenCalled();
  });

  it.each([
    [1, 'sent'],
    [2, 'delivered'],
    [3, 'delivered'],
    [-1, 'failed'],
  ])('maps ack %i to %s on the stored waha send', async (ack, status) => {
    const h = await load();
    expect((await h.POST(post(ackBody(ack), { requestId: `r${ack}` }))).status).toBe(200);
    expect(h.updateOutboundSendStatus).toHaveBeenCalledWith('waha', 'true_2348000000000@c.us_OUT1', status, expect.anything());
  });

  it('ignores a PENDING ack and an ack on an inbound message', async () => {
    const h = await load();
    await h.POST(post(ackBody(0)));
    await h.POST(post(ackBody(3, { fromMe: false })));
    expect(h.updateOutboundSendStatus).not.toHaveBeenCalled();
  });

  it('asks for a retry when a recent ack beats its send record (#941), and drops an old one', async () => {
    let h = await load({ sendMatched: false, sendExists: false });
    expect((await h.POST(post(ackBody(1), { requestId: 'race' }))).status).toBe(500);

    vi.resetModules();
    h = await load({ sendMatched: false, sendExists: false });
    expect((await h.POST(post(ackBody(1, {}, NOW - 5 * 60 * 1000), { requestId: 'old' }))).status).toBe(200);
  });

  it('retries a failed statement send and alerts at the failure threshold', async () => {
    const h = await load({ recentFailures: 3 });
    await h.POST(post(ackBody(-1), { requestId: 'f1' }));
    expect(h.retryFailedStatementSend).toHaveBeenCalledWith('waha', 'true_2348000000000@c.us_OUT1');
    expect(h.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ title: 'WhatsApp replies are failing to deliver' }));
  });

  it.each(['FAILED', 'STOPPED', 'SCAN_QR_CODE'])('raises the urgent DISCONNECTED notice on %s, once per request id', async (status) => {
    const h = await load();
    const body = wahaEvent('session.status', { status });
    await h.POST(post(body, { requestId: 'req-1' }));
    const retry = await h.POST(post(body, { requestId: 'req-1' }));

    await expect(retry.json()).resolves.toMatchObject({ duplicate: true });
    expect(h.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(h.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'urgent', title: expect.stringContaining('DISCONNECTED'), body: expect.stringContaining('WAHA dashboard') })
    );
  });

  it('raises the reconnected notice on WORKING and ignores STARTING', async () => {
    const h = await load();
    await h.POST(post(wahaEvent('session.status', { status: 'STARTING' }), { requestId: 'a' }));
    expect(h.notifyAdmins).not.toHaveBeenCalled();
    await h.POST(post(wahaEvent('session.status', { status: 'WORKING' }), { requestId: 'b' }));
    expect(h.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ title: 'WhatsApp reconnected', priority: 'normal' }));
  });

  it('acknowledges other events without processing them', async () => {
    const h = await load();
    const response = await h.POST(post(wahaEvent('presence.update', {})));
    await expect(response.json()).resolves.toEqual({ received: true, processed: false, ignored: 'presence.update' });
  });
});
