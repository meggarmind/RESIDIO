import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedMessageStore } from '@/lib/whatsapp/types';

const wahaConfig = {
  provider: 'waha' as const,
  apiKey: 'waha-key-unused',
  webhookSecret: 'waha_whsec_route_test',
  baseUrl: 'https://waha.test',
  session: 'default',
  fromNumber: '+15550001111',
};

const recordSystemAction = vi.fn();
const url = 'https://residio.test/api/whatsapp/webhook/waha';
const NOW = Date.parse('2026-10-27T12:00:00.000Z');

/** Independent implementation of the documented hex HMAC-SHA512 over the raw body. */
function sign(body: string, secret = wahaConfig.webhookSecret): string {
  return createHmac('sha512', secret).update(body, 'utf8').digest('hex');
}

function post(
  body: string,
  options: { signature?: string | null; algorithm?: string | null; requestId?: string | null; timestamp?: number | null } = {}
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const signature = options.signature === undefined ? sign(body) : options.signature;
  const algorithm = options.algorithm === undefined ? 'sha512' : options.algorithm;
  const requestId = options.requestId === undefined ? `req-${Math.random()}` : options.requestId;
  if (signature) headers['x-webhook-hmac'] = signature;
  if (algorithm) headers['x-webhook-hmac-algorithm'] = algorithm;
  if (requestId) headers['x-webhook-request-id'] = requestId;
  if (options.timestamp) headers['x-webhook-timestamp'] = String(options.timestamp);
  return new NextRequest(url, { method: 'POST', headers, body });
}

const receivedPayload = {
  id: 'true_2348000000000@c.us_IN1',
  timestamp: Math.floor(NOW / 1000) - 1,
  from: '2348000000000@c.us',
  fromMe: false,
  source: 'app',
  to: '15550001111@c.us',
  body: 'balance',
  hasMedia: false,
  ack: 1,
  ackName: 'SERVER',
};

/** `id` is WAHA's envelope id (an `evt_` ULID): inside the signed body, so the HMAC covers it. */
function webhook(event: string, payload: Record<string, unknown>, id?: string): string {
  return JSON.stringify({ ...(id ? { id } : {}), event, session: 'default', engine: 'NOWEB', metadata: {}, payload });
}

const receivedBody = webhook('message', receivedPayload);

interface Harness {
  handleResidentMessage: ReturnType<typeof vi.fn>;
  notifyAdmins: ReturnType<typeof vi.fn>;
  getPausedUntil: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  store: ProcessedMessageStore;
  updateOutboundSendStatus: ReturnType<typeof vi.fn>;
  outboundSendExists: ReturnType<typeof vi.fn>;
  countRecentOutboundFailures: ReturnType<typeof vi.fn>;
  retryFailedStatementSend: ReturnType<typeof vi.fn>;
  POST: (request: NextRequest) => Promise<Response>;
}

async function load(options: {
  config?: unknown;
  pausedUntil?: Date | null;
  handleResidentMessage?: ReturnType<typeof vi.fn>;
  notifyResult?: { success: boolean; count: number; error?: string };
  sendMatched?: boolean;
  sendExists?: boolean;
  recentFailures?: number;
} = {}): Promise<Harness> {
  vi.doMock('@/lib/whatsapp/config-db', () => ({
    loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue(options.config ?? { status: 'ok', config: wahaConfig }),
  }));

  const handleResidentMessage = options.handleResidentMessage ?? vi.fn().mockResolvedValue(undefined);
  const inbound = await vi.importActual<typeof import('@/lib/whatsapp/inbound')>('@/lib/whatsapp/inbound');
  // One in-memory store shared by every call in the test, standing in for the
  // `whatsapp_processed_messages` table, so a retried request sees the first one's claim.
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
  return {
    handleResidentMessage,
    notifyAdmins,
    getPausedUntil,
    pause,
    store,
    updateOutboundSendStatus,
    outboundSendExists,
    countRecentOutboundFailures,
    retryFailedStatementSend,
    POST,
  };
}

describe('WAHA WhatsApp webhook route', () => {
  beforeEach(() => {
    vi.resetModules();
    recordSystemAction.mockReset();
    vi.unstubAllEnvs();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock('@/lib/whatsapp');
    vi.doUnmock('@/lib/whatsapp/providers/chatmaid-inbound');
    vi.doUnmock('@/lib/notifications/admin-notifier');
    vi.doUnmock('@/lib/system-log/recorder');
    vi.doUnmock('@/lib/whatsapp/outbound-sends');
    vi.doUnmock('@/lib/whatsapp/statement-delivery');
  });

  describe('guards', () => {
    it('returns 503 with the reason when stored credentials are unusable', async () => {
      const h = await load({ config: { status: 'unusable', reason: 'decryption failed' } });
      const response = await h.POST(post(receivedBody));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('decryption failed') });
    }, 15_000);

    it('returns 503 when no provider is configured', async () => {
      const h = await load({ config: { status: 'absent' } });
      expect((await h.POST(post(receivedBody))).status).toBe(503);
    });

    it('returns 503 when the active provider is not waha', async () => {
      const h = await load({
        config: {
          status: 'ok',
          config: { provider: 'chatmaid', apiKey: 'k', webhookSecret: wahaConfig.webhookSecret, fromNumber: '+1', baseUrl: 'https://x.test' },
        },
      });
      expect((await h.POST(post(receivedBody))).status).toBe(503);
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
    });

    it.each([
      ['missing signature', { signature: null }],
      ['wrong secret', { signature: sign(receivedBody, 'not-the-secret') }],
      ['missing algorithm header', { algorithm: null }],
      ['wrong algorithm header', { algorithm: 'sha256' }],
    ])('rejects %s with 401 before any processing', async (_label, options) => {
      const h = await load();
      const response = await h.POST(post(receivedBody, options));

      expect(response.status).toBe(401);
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
      expect(h.notifyAdmins).not.toHaveBeenCalled();
      expect(h.pause).not.toHaveBeenCalled();
      expect(h.getPausedUntil).not.toHaveBeenCalled();
      expect(h.updateOutboundSendStatus).not.toHaveBeenCalled();
      expect(recordSystemAction).not.toHaveBeenCalled();
    });

    it('verifies the HMAC over the raw bytes, not a re-serialisation', async () => {
      const h = await load();
      const pretty = `${JSON.stringify(JSON.parse(receivedBody), null, 2)}\n`;
      expect(pretty).not.toBe(receivedBody);

      expect((await h.POST(post(pretty, { signature: sign(pretty) }))).status).toBe(200);
      expect((await h.POST(post(pretty, { signature: sign(receivedBody) }))).status).toBe(401);
    });

    it('rejects an unparseable body with a bad signature with 401, not 400: the signature is checked before the body is parsed', async () => {
      const h = await load();
      const response = await h.POST(post('not json', { signature: sign('not json', 'not-the-secret') }));

      expect(response.status).toBe(401);
    });

    it('rejects a signed but unparseable body with 400', async () => {
      const h = await load();
      const bad = '{not json';
      const response = await h.POST(post(bad, { signature: sign(bad) }));

      expect(response.status).toBe(400);
    });

    it('rejects a signed body that names no event with 400', async () => {
      const h = await load();
      const noEvent = JSON.stringify({ session: 'default', payload: receivedPayload });
      const response = await h.POST(post(noEvent));

      expect(response.status).toBe(400);
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
    });

    it('acknowledges an unknown event with 200 and does nothing else', async () => {
      const h = await load();
      const response = await h.POST(post(webhook('presence.update', {})));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ processed: false, ignored: 'presence.update' });
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
      expect(h.updateOutboundSendStatus).not.toHaveBeenCalled();
      expect(h.notifyAdmins).not.toHaveBeenCalled();
    });
  });

  describe('body size cap (256 KB)', () => {
    it('rejects a declared content-length over the cap with 413 before reading the body', async () => {
      const h = await load();
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'content-length': String(256 * 1024 + 1), 'x-webhook-hmac': sign(receivedBody), 'x-webhook-hmac-algorithm': 'sha512' },
        body: receivedBody,
      });

      expect((await h.POST(request)).status).toBe(413);
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
    });

    it('rejects a validly signed body over the cap with 413', async () => {
      const h = await load();
      const big = webhook('message', { ...receivedPayload, body: 'a'.repeat(256 * 1024) });

      expect((await h.POST(post(big))).status).toBe(413);
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
    });

    it('applies the cap before the signature: an oversized, badly signed body gets 413, not 401', async () => {
      const h = await load();
      const big = webhook('message', { ...receivedPayload, body: 'a'.repeat(256 * 1024) });

      expect((await h.POST(post(big, { signature: 'bad' }))).status).toBe(413);
    });

    it('accepts a body just under the cap', async () => {
      const h = await load();
      const body = webhook('message', { ...receivedPayload, body: 'a'.repeat(200 * 1024) });

      expect((await h.POST(post(body))).status).toBe(200);
    });
  });

  describe('inbound messages', () => {
    it('processes a message event through the resident handler chain', async () => {
      const h = await load();
      const response = await h.POST(post(receivedBody));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ processed: true, processed_count: 1, ignored_count: 0 });
      expect(h.getPausedUntil).toHaveBeenCalledWith('+2348000000000');
      expect(h.handleResidentMessage).toHaveBeenCalledTimes(1);
      expect(h.handleResidentMessage.mock.calls[0][0]).toMatchObject({
        id: 'true_2348000000000@c.us_IN1',
        from: '+2348000000000',
        text: 'balance',
      });
    });

    it('processes message.any when it is not from the handset', async () => {
      const h = await load();
      const response = await h.POST(post(webhook('message.any', receivedPayload)));

      expect(response.status).toBe(200);
      expect(h.handleResidentMessage).toHaveBeenCalledTimes(1);
    });

    it('answers a message once when WAHA sends it as both message and message.any', async () => {
      const h = await load();
      await h.POST(post(webhook('message', receivedPayload)));
      const second = await h.POST(post(webhook('message.any', receivedPayload)));

      await expect(second.json()).resolves.toMatchObject({ duplicate_count: 1 });
      expect(h.handleResidentMessage).toHaveBeenCalledTimes(1);
    });

    it('does not answer a retried message twice', async () => {
      const h = await load();
      await h.POST(post(receivedBody));
      const retry = await h.POST(post(receivedBody));

      await expect(retry.json()).resolves.toMatchObject({ duplicate_count: 1 });
      expect(h.handleResidentMessage).toHaveBeenCalledTimes(1);
    });

    it('does not reply while the conversation is paused for a human takeover', async () => {
      const h = await load({ pausedUntil: new Date(NOW + 60_000) });
      const response = await h.POST(post(receivedBody));

      await expect(response.json()).resolves.toMatchObject({ processed_count: 1, ignored_count: 1, paused_count: 1, ignored_reason: 'human_takeover' });
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
      expect(recordSystemAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inbound_ignored', summary: { reason: 'human_takeover', count: 1 } })
      );
    });

    it('returns 500 when processing fails, and lets the retry process the message', async () => {
      const failing = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined);
      const h = await load({ handleResidentMessage: failing });

      expect((await h.POST(post(receivedBody))).status).toBe(500);
      const retry = await h.POST(post(receivedBody));
      expect(retry.status).toBe(200);
      await expect(retry.json()).resolves.toMatchObject({ processed_count: 1, duplicate_count: 0 });
    });

    it('does not hand a group message to the Assistant, and counts it as ignored', async () => {
      const h = await load();
      const body = webhook('message', { ...receivedPayload, id: 'g1', from: '120363000000000000@g.us' });
      const response = await h.POST(post(body));

      await expect(response.json()).resolves.toMatchObject({ processed_count: 1, ignored_count: 1 });
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
    });

    it('records the reason for an ignored group message, once, with no number or text', async () => {
      const h = await load();
      const body = webhook('message', { ...receivedPayload, id: 'g2', from: '120363000000000000@g.us' });
      const response = await h.POST(post(body));
      await h.POST(post(body));

      await expect(response.json()).resolves.toMatchObject({ ignored_count: 1, ignored_reason: 'group' });
      expect(recordSystemAction).toHaveBeenCalledTimes(1);
      const entry = recordSystemAction.mock.calls[0][0];
      expect(entry).toEqual({
        source: 'webhook:whatsapp-waha',
        action: 'inbound_ignored',
        outcome: 'success',
        summary: { reason: 'group', count: 1 },
        error: undefined,
      });
      expect(JSON.stringify(entry)).not.toContain('120363000000000000');
      expect(JSON.stringify(entry)).not.toContain('balance');
    });

    it('resolves an @lid sender through the WAHA LID API and answers it', async () => {
      const h = await load();
      const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify({ lid: '98765432109876@lid', pn: '2348000000000@c.us' })));
      vi.stubGlobal('fetch', fetchMock);
      const body = webhook('message', { ...receivedPayload, id: 'l1', from: '98765432109876@lid' });
      const response = await h.POST(post(body));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ processed_count: 1, ignored_count: 0 });
      expect(fetchMock.mock.calls[0][0]).toBe('https://waha.test/api/default/lids/98765432109876%40lid');
      expect(h.handleResidentMessage).toHaveBeenCalledTimes(1);
      expect(h.handleResidentMessage.mock.calls[0][0]).toMatchObject({ id: 'l1', from: '+2348000000000', text: 'balance' });
    });

    it('does not hand an unresolved @lid message to the Assistant, and records lid_unresolved', async () => {
      const h = await load();
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ lid: '98765432109876@lid', pn: null }))));
      const body = webhook('message', { ...receivedPayload, id: 'l2', from: '98765432109876@lid' });
      const response = await h.POST(post(body));

      await expect(response.json()).resolves.toMatchObject({ ignored_count: 1, ignored_reason: 'lid_unresolved' });
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
      expect(recordSystemAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inbound_ignored', summary: { reason: 'lid_unresolved', count: 1 } })
      );
      expect(JSON.stringify(recordSystemAction.mock.calls)).not.toContain('98765432109876');
    });

    it('returns 500 and claims nothing when the LID lookup fails, so the retry resolves it', async () => {
      const h = await load();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(new Response('{}', { status: 502 }))
          .mockResolvedValue(new Response(JSON.stringify({ lid: '98765432109876@lid', pn: '2348000000000@c.us' })))
      );
      const body = webhook('message', { ...receivedPayload, id: 'l3', from: '98765432109876@lid' });

      expect((await h.POST(post(body))).status).toBe(500);
      expect(recordSystemAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'inbound_messages', outcome: 'failure', summary: { reason: 'lid_lookup_failed' } })
      );
      expect(h.handleResidentMessage).not.toHaveBeenCalled();

      expect((await h.POST(post(body))).status).toBe(200);
      expect(h.handleResidentMessage).toHaveBeenCalledTimes(1);
    });

    it('does not answer the handset\'s own api send delivered as message.any', async () => {
      const h = await load();
      const body = webhook('message.any', { ...receivedPayload, id: 'out1', fromMe: true, source: 'api', to: '2348000000000@c.us' });
      const response = await h.POST(post(body));

      await expect(response.json()).resolves.toMatchObject({ processed: false, ignored: 'not_manual' });
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
      expect(h.pause).not.toHaveBeenCalled();
    });

    it('records one success row with counts, and no phone number or message text', async () => {
      const h = await load();
      await h.POST(post(receivedBody));

      expect(recordSystemAction).toHaveBeenCalledTimes(1);
      const entry = recordSystemAction.mock.calls[0][0];
      expect(entry).toMatchObject({
        source: 'webhook:whatsapp-waha',
        action: 'inbound_messages',
        outcome: 'success',
        summary: { processed: 1, duplicates: 0, ignored: 0, paused: 0 },
      });
      expect(JSON.stringify(entry)).not.toContain('2348000000000');
      expect(JSON.stringify(entry)).not.toContain('balance');
    });

    it('records a failure row when processing fails', async () => {
      const h = await load({ handleResidentMessage: vi.fn().mockRejectedValue(new Error('db down')) });
      expect((await h.POST(post(receivedBody))).status).toBe(500);
      expect(recordSystemAction).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'webhook:whatsapp-waha', outcome: 'failure' })
      );
    });
  });

  describe('human takeover', () => {
    const manual = webhook('message.any', { id: 'hand1', fromMe: true, source: 'app', to: '2348000000000@c.us', from: '15550001111@c.us', body: 'Hello from the office' });

    it('pauses the recipient conversation for 30 minutes on a handset message', async () => {
      const h = await load();
      const response = await h.POST(post(manual));

      expect(response.status).toBe(200);
      expect(h.pause).toHaveBeenCalledTimes(1);
      expect(h.pause).toHaveBeenCalledWith('+2348000000000', new Date(NOW + 30 * 60 * 1000));
      expect(h.handleResidentMessage).not.toHaveBeenCalled();
    });

    it('ignores a handset message with no usable recipient', async () => {
      const h = await load();
      const body = webhook('message.any', { id: 'hand2', fromMe: true, source: 'app', body: 'x' });

      await expect((await h.POST(post(body))).json()).resolves.toMatchObject({ ignored: 'no_recipient' });
      expect(h.pause).not.toHaveBeenCalled();
    });

    it('returns 500 and records a failure row when the pause cannot be stored', async () => {
      const h = await load();
      h.pause.mockRejectedValueOnce(new Error('db down'));

      expect((await h.POST(post(manual))).status).toBe(500);
      expect(recordSystemAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'human_takeover', outcome: 'failure' })
      );
      expect(JSON.stringify(recordSystemAction.mock.calls)).not.toContain('2348000000000');
    });

    it('records nothing for a successful pause', async () => {
      const h = await load();
      await h.POST(post(manual));
      expect(recordSystemAction).not.toHaveBeenCalled();
    });
  });

  describe('delivery acks', () => {
    const ack = (value: number, extra: Record<string, unknown> = {}, envelopeId?: string) =>
      webhook('message.ack', { id: 'true_2348000000000@c.us_OUT1', from: '15550001111@c.us', fromMe: true, ack: value, ackName: 'X', ...extra }, envelopeId);

    it.each([
      [1, 'sent'],
      [2, 'delivered'],
      [3, 'delivered'],
    ])('maps ack %i to %s without a log row', async (value, status) => {
      const h = await load();

      expect((await h.POST(post(ack(value)))).status).toBe(200);
      expect(h.updateOutboundSendStatus).toHaveBeenCalledWith('waha', 'true_2348000000000@c.us_OUT1', status, { code: null, message: null });
      expect(recordSystemAction).not.toHaveBeenCalled();
      expect(h.notifyAdmins).not.toHaveBeenCalled();
    });

    it.each([0, 4, 7])('ignores ack %i', async (value) => {
      const h = await load();
      const response = await h.POST(post(ack(value)));

      await expect(response.json()).resolves.toMatchObject({ processed: false, ignored: `ack_${value}` });
      expect(h.updateOutboundSendStatus).not.toHaveBeenCalled();
    });

    it('ignores an ack without a message id', async () => {
      const h = await load();
      const body = webhook('message.ack', { ack: 1 });

      await expect((await h.POST(post(body))).json()).resolves.toMatchObject({ ignored: 'no_message_id' });
      expect(h.updateOutboundSendStatus).not.toHaveBeenCalled();
    });

    it('marks an ERROR ack failed, records one outbound_failed row, and nothing for the retried delivery', async () => {
      const h = await load();
      const body = ack(-1, { ackName: 'ERROR' }, 'evt_fail');

      expect((await h.POST(post(body))).status).toBe(200);
      expect((await h.POST(post(body))).status).toBe(200);

      expect(h.updateOutboundSendStatus).toHaveBeenCalledTimes(1);
      expect(h.updateOutboundSendStatus).toHaveBeenCalledWith('waha', 'true_2348000000000@c.us_OUT1', 'failed', {
        code: 'ERROR',
        message: 'WAHA reported a delivery error',
      });
      expect(recordSystemAction).toHaveBeenCalledTimes(1);
      expect(recordSystemAction).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'webhook:whatsapp-waha',
          action: 'outbound_failed',
          outcome: 'failure',
          summary: expect.objectContaining({ matchedSend: true }),
        })
      );
      expect(JSON.stringify(recordSystemAction.mock.calls)).not.toContain('2348000000000');
    });

    it('retries a failed statement PDF send once, and a retry error never fails the event', async () => {
      const h = await load();
      h.retryFailedStatementSend.mockRejectedValueOnce(new Error('signing failed'));
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect((await h.POST(post(ack(-1, { ackName: 'ERROR' })))).status).toBe(200);
      expect(h.retryFailedStatementSend).toHaveBeenCalledWith('waha', 'true_2348000000000@c.us_OUT1');
      error.mockRestore();
    });

    it('alerts admins when the failure is the third in the window, and not at 2 or 4', async () => {
      const third = await load({ recentFailures: 3 });
      await third.POST(post(ack(-1)));
      expect(third.notifyAdmins).toHaveBeenCalledTimes(1);
      expect(third.notifyAdmins.mock.calls[0][0]).toMatchObject({ category: 'system', actionUrl: '/settings/whatsapp' });
      expect(third.notifyAdmins.mock.calls[0][0].body).toContain('WAHA dashboard');

      for (const recentFailures of [2, 4]) {
        vi.resetModules();
        const h = await load({ recentFailures });
        await h.POST(post(ack(-1)));
        expect(h.notifyAdmins).not.toHaveBeenCalled();
      }
    });

    it('retries (500) an unmatched ack for a send that is not stored yet, within the 2 minute window', async () => {
      const h = await load({ sendMatched: false, sendExists: false });

      expect((await h.POST(post(ack(2), { timestamp: NOW - 30_000 }))).status).toBe(500);
      expect(h.outboundSendExists).toHaveBeenCalledWith('waha', 'true_2348000000000@c.us_OUT1');
    });

    it('treats a missing timestamp header as recent', async () => {
      const h = await load({ sendMatched: false, sendExists: false });
      expect((await h.POST(post(ack(2)))).status).toBe(500);
    });

    it('drops an old unmatched ack with a 200, and a dropped failure still gets its log row', async () => {
      const h = await load({ sendMatched: false, sendExists: false });

      expect((await h.POST(post(ack(-1), { timestamp: NOW - 3 * 60_000 }))).status).toBe(200);
      expect(h.outboundSendExists).not.toHaveBeenCalled();
      expect(recordSystemAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'outbound_failed', summary: expect.objectContaining({ matchedSend: false }) })
      );
    });

    it('does not ask for a retry when the send exists but was already settled (an out-of-order ack)', async () => {
      const h = await load({ sendMatched: false, sendExists: true });

      expect((await h.POST(post(ack(1)))).status).toBe(200);
    });

    it('returns 500 and releases the claim when the status cannot be stored, so the retry applies it', async () => {
      const h = await load();
      h.updateOutboundSendStatus.mockRejectedValueOnce(new Error('db down'));
      const body = ack(2, {}, 'evt_db');

      expect((await h.POST(post(body))).status).toBe(500);
      expect(recordSystemAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'outbound_status', outcome: 'failure' })
      );
      expect((await h.POST(post(body))).status).toBe(200);
      expect(h.updateOutboundSendStatus).toHaveBeenCalledTimes(2);
    });

    it('applies two different acks for one message, since each delivery has its own envelope id', async () => {
      const h = await load();

      await h.POST(post(ack(1, {}, 'evt_a')));
      await h.POST(post(ack(3, {}, 'evt_b')));

      expect(h.updateOutboundSendStatus.mock.calls.map((call) => call[2])).toEqual(['sent', 'delivered']);
    });
  });

  describe('session status', () => {
    const status = (value: string, envelopeId?: string) => webhook('session.status', { name: 'default', status: value }, envelopeId);

    it.each(['FAILED', 'STOPPED', 'SCAN_QR_CODE', 'PASSKEY_REQUIRED', 'PASSKEY_CONFIRMATION_REQUIRED'])('raises one urgent DISCONNECTED notice on %s, none for a retried delivery', async (value) => {
      const h = await load();

      expect((await h.POST(post(status(value, 'evt_down')))).status).toBe(200);
      expect((await h.POST(post(status(value, 'evt_down')))).status).toBe(200);

      expect(h.notifyAdmins).toHaveBeenCalledTimes(1);
      const alert = h.notifyAdmins.mock.calls[0][0];
      expect(alert).toMatchObject({ priority: 'urgent', category: 'system', actionUrl: '/settings/whatsapp' });
      expect(alert.title).toContain('DISCONNECTED');
      expect(alert.body).toContain('WAHA dashboard');
      expect(alert.body).toMatch(/permanently lost/);
      expect(alert.body).not.toContain('Chatmaid');
    });

    it('sends a normal-priority reconnected notice on WORKING', async () => {
      const h = await load();

      expect((await h.POST(post(status('WORKING')))).status).toBe(200);
      expect(h.notifyAdmins).toHaveBeenCalledTimes(1);
      expect(h.notifyAdmins.mock.calls[0][0]).toMatchObject({ priority: 'normal', title: 'WhatsApp reconnected' });
    });

    it('raises a second notice for a new envelope id (a fresh disconnect), not a retry', async () => {
      const h = await load();

      await h.POST(post(status('FAILED', 'evt_1')));
      await h.POST(post(status('FAILED', 'evt_2')));

      expect(h.notifyAdmins).toHaveBeenCalledTimes(2);
    });

    it('does not raise a second notice for a replayed signed body under a fresh request-id header', async () => {
      const h = await load();
      const body = status('STOPPED', 'evt_replayed');

      const first = await h.POST(post(body, { requestId: 'req-original' }));
      const replay = await h.POST(post(body, { requestId: 'req-forged' }));

      expect(first.status).toBe(200);
      await expect(replay.json()).resolves.toMatchObject({ processed: true, duplicate: true });
      expect(h.notifyAdmins).toHaveBeenCalledTimes(1);
    });

    it('falls back to the body hash when the envelope has no id, so a replay still dedupes', async () => {
      const h = await load();
      const body = status('STOPPED');

      await h.POST(post(body, { requestId: 'req-1' }));
      const replay = await h.POST(post(body, { requestId: 'req-2' }));

      await expect(replay.json()).resolves.toMatchObject({ duplicate: true });
      expect(h.notifyAdmins).toHaveBeenCalledTimes(1);
    });

    it('ignores STARTING without a notice', async () => {
      const h = await load();
      const response = await h.POST(post(status('STARTING')));

      await expect(response.json()).resolves.toMatchObject({ processed: false, ignored: 'session.status' });
      expect(h.notifyAdmins).not.toHaveBeenCalled();
    });

    it('records one phone_disconnected success, and nothing for the retried delivery', async () => {
      const h = await load();

      await h.POST(post(status('FAILED', 'evt_x')));
      await h.POST(post(status('FAILED', 'evt_x')));

      expect(recordSystemAction).toHaveBeenCalledTimes(1);
      expect(recordSystemAction).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'webhook:whatsapp-waha', action: 'phone_disconnected', outcome: 'success' })
      );
    });

    it('returns 500 and releases the claim when the notice cannot be sent, so the retry alerts', async () => {
      const h = await load({ notifyResult: { success: false, count: 0, error: 'insert failed' } });

      expect((await h.POST(post(status('FAILED', 'evt_retry')))).status).toBe(500);
      expect(recordSystemAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'phone_disconnected', outcome: 'failure' })
      );

      h.notifyAdmins.mockResolvedValue({ success: true, count: 1 });
      expect((await h.POST(post(status('FAILED', 'evt_retry')))).status).toBe(200);
      expect(h.notifyAdmins).toHaveBeenCalledTimes(2);
    });
  });
});
