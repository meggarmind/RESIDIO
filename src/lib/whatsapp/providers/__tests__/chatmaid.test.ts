import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createChatmaidWhatsAppProvider } from '@/lib/whatsapp/providers/chatmaid';
import { isProviderSupported } from '@/lib/whatsapp/provider';
import type { ChatmaidWhatsAppConfig } from '@/lib/whatsapp/config';

// The provider caches connection-check results in module scope, keyed by
// `baseUrl|fromNumber` (see chatmaid.ts). Giving each test its own baseUrl
// keeps that cache from leaking between tests without reaching into the
// module's internals.
let baseUrlCounter = 0;
function makeConfig(overrides: Partial<ChatmaidWhatsAppConfig> = {}): ChatmaidWhatsAppConfig {
  baseUrlCounter += 1;
  return {
    provider: 'chatmaid',
    apiKey: 'sk_test_super-secret-key',
    webhookSecret: 'whsec_test',
    fromNumber: '+2348037000101',
    baseUrl: `https://developers-api.chatmaid.test/${baseUrlCounter}`,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const connectedPhoneNumbersResponse = (config: ChatmaidWhatsAppConfig) =>
  jsonResponse({ data: [{ id: 'phone-1', e164: config.fromNumber }] });

const connectedStatusResponse = () => jsonResponse({ connectionStatus: 'connected' });

const disconnectedStatusResponse = () => jsonResponse({ connectionStatus: 'disconnected' });

/**
 * A fetch mock that answers the two connection-check calls (phone-numbers
 * list, then status) before any responses queued for the send call itself.
 */
function fetchWithConnection(
  config: ChatmaidWhatsAppConfig,
  connectionResponses: [Response, Response] = [
    connectedPhoneNumbersResponse(config),
    connectedStatusResponse(),
  ],
  ...sendResponses: Response[]
) {
  const fetchImpl = vi.fn();
  fetchImpl.mockResolvedValueOnce(connectionResponses[0]);
  fetchImpl.mockResolvedValueOnce(connectionResponses[1]);
  for (const response of sendResponses) {
    fetchImpl.mockResolvedValueOnce(response);
  }
  return fetchImpl;
}

describe('Chatmaid WhatsApp provider', () => {
  it('is registered as a supported provider', () => {
    expect(isProviderSupported(makeConfig())).toBe(true);
  });

  it('sends a text message with the expected request shape and bearer auth header', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithConnection(
      config,
      undefined,
      jsonResponse({ data: { id: 'msg_abc123' } }, 201)
    );
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Test message' });

    expect(result).toEqual({ success: true, messageId: 'msg_abc123' });

    // Calls 1-2: connection check. Call 3: the actual send.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const sendCall = fetchImpl.mock.calls[2];
    expect(sendCall[0]).toBe(`${config.baseUrl}/v1/messages/send`);
    const init = sendCall[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${config.apiKey}`
    );

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      fromPhoneId: config.fromNumber,
      to: '+2348000000000',
      content: 'Test message',
      idempotencyKey: expect.any(String),
    });
  });

  it('resolves the phone id from /v1/phone-numbers and checks /v1/phone-numbers/:id/status', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithConnection(
      config,
      undefined,
      jsonResponse({ data: { id: 'msg_abc' } }, 201)
    );
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);

    await provider.sendText({ to: '+2348000000000', body: 'Hi' });

    expect(fetchImpl.mock.calls[0][0]).toBe(`${config.baseUrl}/v1/phone-numbers`);
    expect(fetchImpl.mock.calls[1][0]).toBe(
      `${config.baseUrl}/v1/phone-numbers/phone-1/status`
    );
  });

  it('produces an identical idempotency key for an identical body and a different one when content changes', async () => {
    const config = makeConfig();
    const expectedForOriginal = createHash('sha256')
      .update(`${config.fromNumber}|+2348000000000|Same body`, 'utf8')
      .digest('hex')
      .slice(0, 64);
    const expectedForChanged = createHash('sha256')
      .update(`${config.fromNumber}|+2348000000000|Different body`, 'utf8')
      .digest('hex')
      .slice(0, 64);
    expect(expectedForOriginal).not.toBe(expectedForChanged);

    const fetchImpl = fetchWithConnection(
      config,
      undefined,
      jsonResponse({ data: { id: 'msg_1' } }, 201)
    );
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);
    await provider.sendText({ to: '+2348000000000', body: 'Same body' });
    const firstKey = JSON.parse((fetchImpl.mock.calls[2][1] as RequestInit).body as string)
      .idempotencyKey;
    expect(firstKey).toBe(expectedForOriginal);

    // Same config -> cached connection, so only the send call is queued.
    fetchImpl.mockResolvedValueOnce(jsonResponse({ data: { id: 'msg_2' } }, 201));
    await provider.sendText({ to: '+2348000000000', body: 'Same body' });
    const secondKey = JSON.parse((fetchImpl.mock.calls[3][1] as RequestInit).body as string)
      .idempotencyKey;
    expect(secondKey).toBe(firstKey);

    fetchImpl.mockResolvedValueOnce(jsonResponse({ data: { id: 'msg_3' } }, 201));
    await provider.sendText({ to: '+2348000000000', body: 'Different body' });
    const thirdKey = JSON.parse((fetchImpl.mock.calls[4][1] as RequestInit).body as string)
      .idempotencyKey;
    expect(thirdKey).toBe(expectedForChanged);
    expect(thirdKey).not.toBe(firstKey);
  });

  it('does not attempt to send when the resolved phone is disconnected', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithConnection(config, [
      connectedPhoneNumbersResponse(config),
      disconnectedStatusResponse(),
    ]);
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Hi' });

    expect(result).toEqual({ success: false, error: 'Chatmaid bridge is disconnected' });
    // Only the two connection-check calls -- no third call to /v1/messages/send.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('treats a 404 from the send call itself as disconnected', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithConnection(
      config,
      undefined,
      jsonResponse(
        { success: false, error: 'Not found', statusCode: 404, message: [], timestamp: '', path: '' },
        404
      )
    );
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Hi' });

    expect(result).toEqual({ success: false, error: 'Chatmaid bridge is disconnected' });
  });

  it('surfaces retryAfter from a 429 response in the error message', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithConnection(
      config,
      undefined,
      jsonResponse(
        {
          success: false,
          error: 'Too Many Requests',
          message: ['Rate limit exceeded'],
          statusCode: 429,
          timestamp: '2026-09-21T00:00:00.000Z',
          path: '/v1/messages/send',
          retryAfter: 42,
        },
        429
      )
    );
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('42');
    expect(result.error?.toLowerCase()).toContain('retry');
  });

  it('renders a template to plain text and sends it as content', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithConnection(
      config,
      undefined,
      jsonResponse({ data: { id: 'msg_template' } }, 201)
    );
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendTemplate({
      to: '+2348000000000',
      templateName: 'invoice_reminder',
      languageCode: 'en_US',
      parameters: ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'],
    });

    expect(result).toEqual({ success: true, messageId: 'msg_template' });
    const sendBody = JSON.parse((fetchImpl.mock.calls[2][1] as RequestInit).body as string);
    expect(sendBody.content).toContain('Ada');
    expect(sendBody.content).toContain('INV-001');
    expect(sendBody.content).toContain('NGN 10,000');
    expect(sendBody.content).toContain('1 Sep');
  });

  it('never includes the API key in a returned error', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithConnection(
      config,
      undefined,
      jsonResponse(
        {
          success: false,
          error: 'Unauthorized',
          message: ['Invalid credentials'],
          statusCode: 401,
          timestamp: '',
          path: '/v1/messages/send',
        },
        401
      )
    );
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Hi' });

    expect(result.success).toBe(false);
    expect(result.error).not.toContain(config.apiKey);
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
  });

  it('never includes the API key in a disconnected-bridge error', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithConnection(config, [
      connectedPhoneNumbersResponse(config),
      disconnectedStatusResponse(),
    ]);
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Hi' });

    expect(JSON.stringify(result)).not.toContain(config.apiKey);
  });

  it('rejects content over the 4096-character limit without making a network call', async () => {
    const config = makeConfig();
    const fetchImpl = vi.fn();
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);

    const tooLong = 'a'.repeat(4097);
    const result = await provider.sendText({ to: '+2348000000000', body: tooLong });

    expect(result.success).toBe(false);
    expect(result.error).toContain('4096');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts content at exactly the 4096-character limit', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithConnection(
      config,
      undefined,
      jsonResponse({ data: { id: 'msg_max' } }, 201)
    );
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);

    const exactlyMax = 'a'.repeat(4096);
    const result = await provider.sendText({ to: '+2348000000000', body: exactlyMax });

    expect(result).toEqual({ success: true, messageId: 'msg_max' });
  });

  it('caches a connected status for 30s so a second send in that window skips the connection check', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithConnection(
      config,
      undefined,
      jsonResponse({ data: { id: 'msg_1' } }, 201)
    );
    const provider = createChatmaidWhatsAppProvider(config, fetchImpl);

    await provider.sendText({ to: '+2348000000000', body: 'First' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    fetchImpl.mockResolvedValueOnce(jsonResponse({ data: { id: 'msg_2' } }, 201));
    await provider.sendText({ to: '+2348000000000', body: 'Second' });
    // Only one additional call (the send) -- the cached connection check was reused.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
