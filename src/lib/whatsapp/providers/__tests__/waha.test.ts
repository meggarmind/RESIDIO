import { describe, expect, it, vi } from 'vitest';
import { isProviderSupported } from '@/lib/whatsapp/provider';
import {
  createWahaWhatsAppProvider,
  fetchWahaConnectionStatus,
  lookupWahaLidPhone,
  lookupWahaPhone,
} from '@/lib/whatsapp/providers/waha';
import type { WahaWhatsAppConfig } from '@/lib/whatsapp/config';

// The provider caches the session check in module scope, keyed by
// `baseUrl|session|<api key fingerprint>`. A distinct baseUrl per test keeps
// that cache from leaking between tests.
let baseUrlCounter = 0;
function makeConfig(overrides: Partial<WahaWhatsAppConfig> = {}): WahaWhatsAppConfig {
  baseUrlCounter += 1;
  return {
    provider: 'waha',
    apiKey: 'waha-super-secret-key',
    webhookSecret: 'waha-webhook-secret',
    baseUrl: `https://waha.test/${baseUrlCounter}`,
    session: 'default',
    fromNumber: '+2348037000101',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const workingSession = () =>
  jsonResponse({ name: 'default', status: 'WORKING', me: { id: '2348037000101@c.us', pushName: 'Estate' } });

/** A fetch mock that answers the session check first, then the queued responses in order. */
function fetchWithSession(session: Response, ...sendResponses: Response[]) {
  const fetchImpl = vi.fn();
  fetchImpl.mockResolvedValueOnce(session);
  for (const response of sendResponses) {
    fetchImpl.mockResolvedValueOnce(response);
  }
  return fetchImpl;
}

const messageResponse = (id: string) => jsonResponse({ id }, 201);

function bodyOf(fetchImpl: ReturnType<typeof vi.fn>, call: number) {
  return JSON.parse((fetchImpl.mock.calls[call][1] as RequestInit).body as string);
}

describe('WAHA WhatsApp provider', () => {
  it('is registered as a supported provider', () => {
    expect(isProviderSupported(makeConfig())).toBe(true);
  });

  it('sends text with the X-Api-Key header, the session and a digits@c.us chat id', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(workingSession(), messageResponse('true_2348000000000@c.us_3EB0AA'));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Test message' });

    expect(result).toEqual({ success: true, messageId: 'true_2348000000000@c.us_3EB0AA' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [checkUrl, checkInit] = fetchImpl.mock.calls[0];
    expect(checkUrl).toBe(`${config.baseUrl}/api/sessions/default`);
    expect((checkInit as RequestInit).headers).toEqual({ 'X-Api-Key': config.apiKey });

    const [sendUrl, sendInit] = fetchImpl.mock.calls[1];
    expect(sendUrl).toBe(`${config.baseUrl}/api/sendText`);
    expect((sendInit as RequestInit).method).toBe('POST');
    expect((sendInit as RequestInit).headers).toMatchObject({ 'X-Api-Key': config.apiKey });
    expect(bodyOf(fetchImpl, 1)).toEqual({
      session: 'default',
      chatId: '2348000000000@c.us',
      text: 'Test message',
    });
  });

  it('accepts idempotencySeed and does not send it (WAHA has no idempotency key)', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(workingSession(), messageResponse('id1'));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    await provider.sendText({ to: '+2348000000000', body: 'Menu', idempotencySeed: 'wamid.A' });

    expect(JSON.stringify(bodyOf(fetchImpl, 1))).not.toContain('wamid.A');
  });

  it('sends the text first, then one sendFile per URL, with the caption on the first file only (#871)', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(
      workingSession(),
      messageResponse('text-id'),
      messageResponse('file-1'),
      messageResponse('file-2')
    );
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({
      to: '+2348000000000',
      body: 'Notice',
      mediaUrls: ['https://storage.test/a/notice%20one.pdf?token=abc', 'https://storage.test/b/second.pdf'],
    });

    // The first accepted message is the one tracked for delivery.
    expect(result).toEqual({ success: true, messageId: 'text-id' });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `${config.baseUrl}/api/sessions/default`,
      `${config.baseUrl}/api/sendText`,
      `${config.baseUrl}/api/sendFile`,
      `${config.baseUrl}/api/sendFile`,
    ]);
    expect(bodyOf(fetchImpl, 2)).toEqual({
      session: 'default',
      chatId: '2348000000000@c.us',
      file: { url: 'https://storage.test/a/notice%20one.pdf?token=abc', mimetype: 'application/pdf', filename: 'notice one.pdf' },
      caption: 'notice one.pdf',
    });
    const second = bodyOf(fetchImpl, 3);
    expect(second.file).toEqual({ url: 'https://storage.test/b/second.pdf', mimetype: 'application/pdf', filename: 'second.pdf' });
    expect(second).not.toHaveProperty('caption');
  });

  it('skips the text request for a file-only send', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(workingSession(), messageResponse('file-1'));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: '', mediaUrls: ['https://storage.test/a.pdf'] });

    expect(result).toEqual({ success: true, messageId: 'file-1' });
    expect(fetchImpl.mock.calls[1][0]).toBe(`${config.baseUrl}/api/sendFile`);
  });

  it('makes a failed file after a sent text final, so a retry does not send the text twice', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(workingSession(), messageResponse('text-id'), jsonResponse({ message: 'boom' }, 503));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Notice', mediaUrls: ['https://storage.test/a.pdf'] });

    expect(result).toEqual({ success: false, error: 'boom', retryable: false });
  });

  it('renders a template to text and sends it through sendText', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(workingSession(), messageResponse('msg_template'));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendTemplate({
      to: '+2348000000000',
      templateName: 'announcement',
      languageCode: 'en_US',
      parameters: ['Water outage', 'Estate-wide water outage today.'],
    });

    expect(result).toEqual({ success: true, messageId: 'msg_template' });
    expect(fetchImpl.mock.calls[1][0]).toBe(`${config.baseUrl}/api/sendText`);
    expect(bodyOf(fetchImpl, 1).text).toBe('Water outage\n\nEstate-wide water outage today.');
  });

  it('renders the payment_received template to the exact plain text Chatmaid renders', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(workingSession(), messageResponse('msg_template'));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    await provider.sendTemplate({
      to: '+2348000000000',
      templateName: 'payment_received',
      languageCode: 'en_US',
      parameters: ['Ada', 'NGN 5,000', '01/09', 'REF'],
    });

    expect(bodyOf(fetchImpl, 1).text).toBe(
      "Hi Ada, we've received your payment of NGN 5,000 on 01/09 (Ref: REF). Thank you."
    );
  });

  it('caches a WORKING reading for 30s so a second send skips the session check', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(workingSession(), messageResponse('id1'));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    await provider.sendText({ to: '+2348000000000', body: 'First' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    fetchImpl.mockResolvedValueOnce(messageResponse('id2'));
    const second = await provider.sendText({ to: '+2348000000000', body: 'Second' });

    expect(second).toEqual({ success: true, messageId: 'id2' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[2][0]).toBe(`${config.baseUrl}/api/sendText`);
  });

  it('keeps refusing from the cache while a non-WORKING reading is inside the 30s window, with one session fetch', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(jsonResponse({ name: 'default', status: 'STOPPED' }));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const first = await provider.sendText({ to: '+2348000000000', body: 'First' });
    const second = await provider.sendText({ to: '+2348000000000', body: 'Second' });

    expect(first).toEqual({ success: false, error: 'WAHA bridge is disconnected' });
    expect(second).toEqual({ success: false, error: 'WAHA bridge is disconnected' });
    // The second refusal came from the cache, and no send was ever attempted.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${config.baseUrl}/api/sessions/default`);
  });

  it('checks the session again once the 30s cache has expired', async () => {
    vi.useFakeTimers();
    try {
      const config = makeConfig();
      const fetchImpl = fetchWithSession(workingSession(), messageResponse('id1'), workingSession(), messageResponse('id2'));
      const provider = createWahaWhatsAppProvider(config, fetchImpl);

      await provider.sendText({ to: '+2348000000000', body: 'First' });
      vi.advanceTimersByTime(30_001);
      await provider.sendText({ to: '+2348000000000', body: 'Second' });

      expect(fetchImpl).toHaveBeenCalledTimes(4);
      expect(fetchImpl.mock.calls[2][0]).toBe(`${config.baseUrl}/api/sessions/default`);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reuse a cached reading across a rotated API key on the same server and session', async () => {
    const base = makeConfig();
    const fetchImpl = fetchWithSession(workingSession(), messageResponse('id1'), workingSession(), messageResponse('id2'));

    await createWahaWhatsAppProvider({ ...base, apiKey: 'key-one' }, fetchImpl).sendText({ to: '+2348000000000', body: 'A' });
    await createWahaWhatsAppProvider({ ...base, apiKey: 'key-two' }, fetchImpl).sendText({ to: '+2348000000000', body: 'B' });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it.each(['STOPPED', 'STARTING', 'SCAN_QR_CODE', 'FAILED'])(
    'refuses to send when the session is %s, without a send request',
    async (status) => {
      const config = makeConfig();
      const fetchImpl = fetchWithSession(jsonResponse({ name: 'default', status }));
      const provider = createWahaWhatsAppProvider(config, fetchImpl);

      const result = await provider.sendText({ to: '+2348000000000', body: 'Hi' });

      expect(result).toEqual({ success: false, error: 'WAHA bridge is disconnected' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );

  it('reports disconnected when the session check fails at the transport', async () => {
    const config = makeConfig();
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Hi' });

    expect(result).toEqual({ success: false, error: 'WAHA bridge is disconnected' });
  });

  it('reports disconnected when the session check answers with an HTTP error', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(jsonResponse({ message: 'Unauthorized' }, 401));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Hi' });

    expect(result).toEqual({ success: false, error: 'WAHA bridge is disconnected' });
  });

  it('treats a 422 from the send as disconnected and clears the cache', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(
      workingSession(),
      jsonResponse({ message: 'Session status is not as expected' }, 422),
      workingSession(),
      messageResponse('id2')
    );
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const first = await provider.sendText({ to: '+2348000000000', body: 'Hi' });
    expect(first).toEqual({ success: false, error: 'WAHA bridge is disconnected' });

    const second = await provider.sendText({ to: '+2348000000000', body: 'Hi again' });
    expect(second.success).toBe(true);
    // The cache was cleared, so the session was read again.
    expect(fetchImpl.mock.calls[2][0]).toBe(`${config.baseUrl}/api/sessions/default`);
  });

  it('marks a 429 as retryable', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(workingSession(), jsonResponse({ message: 'Too many requests' }, 429));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Hi' });

    expect(result).toEqual({ success: false, error: 'WAHA rate limit exceeded', retryable: true });
  });

  it('marks a 5xx as retryable and a 400 as not retryable', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(workingSession(), jsonResponse({ message: 'upstream down' }, 502), jsonResponse({ message: 'bad chatId' }, 400));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    expect(await provider.sendText({ to: '+2348000000000', body: 'Hi' })).toMatchObject({ success: false, retryable: true });
    expect(await provider.sendText({ to: '+2348000000000', body: 'Hi' })).toMatchObject({
      success: false,
      error: 'bad chatId',
      retryable: false,
    });
  });

  it('marks a send transport failure as retryable', async () => {
    const config = makeConfig();
    const fetchImpl = vi.fn().mockResolvedValueOnce(workingSession()).mockRejectedValueOnce(new Error('socket hang up'));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Hi' });

    expect(result).toEqual({ success: false, error: 'WAHA provider request failed', retryable: true });
  });

  it('reads the message id from the WEBJS and NOWEB send answers, in the form message.ack carries (#1285)', async () => {
    const webjs = createWahaWhatsAppProvider(
      makeConfig(),
      fetchWithSession(workingSession(), jsonResponse({ id: { fromMe: true, id: '3EB0AA', _serialized: 'true_2348000000000@c.us_3EB0AA' } }, 201))
    );
    const noweb = createWahaWhatsAppProvider(
      makeConfig(),
      fetchWithSession(
        workingSession(),
        jsonResponse({ key: { remoteJid: '2348000000000@s.whatsapp.net', fromMe: true, id: 'BAE5CC' }, status: 'PENDING' }, 201)
      )
    );

    expect(await webjs.sendText({ to: '+2348000000000', body: 'Hi' })).toEqual({ success: true, messageId: 'true_2348000000000@c.us_3EB0AA' });
    expect(await noweb.sendText({ to: '+2348000000000', body: 'Hi' })).toEqual({ success: true, messageId: 'true_2348000000000@c.us_BAE5CC' });
  });

  it('fails without retry when the response carries no message id', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(workingSession(), jsonResponse({ ok: true }, 201));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '+2348000000000', body: 'Hi' });

    expect(result).toEqual({ success: false, error: 'WAHA provider returned no message ID', retryable: false });
  });

  it('never includes the API key in any returned error', async () => {
    const failures: Response[][] = [
      [workingSession(), jsonResponse({ message: 'Unauthorized' }, 401)],
      [workingSession(), jsonResponse({}, 429)],
      [workingSession(), jsonResponse({}, 422)],
      [workingSession(), jsonResponse({}, 201)],
      [jsonResponse({ status: 'STOPPED' })],
    ];

    for (const [first, ...rest] of failures) {
      // A fresh config per case, so the 30s cache from an earlier case does not skip the check.
      const config = makeConfig();
      const fetchImpl = fetchWithSession(first, ...rest);
      const result = await createWahaWhatsAppProvider(config, fetchImpl).sendText({ to: '+2348000000000', body: 'Hi' });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result)).not.toContain(config.apiKey);
    }
  });

  it('never includes the API key in an error when the transport throws', async () => {
    const config = makeConfig();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(workingSession())
      .mockRejectedValueOnce(new Error(`request with X-Api-Key ${config.apiKey} failed`));
    const result = await createWahaWhatsAppProvider(config, fetchImpl).sendText({ to: '+2348000000000', body: 'Hi' });

    expect(JSON.stringify(result)).not.toContain(config.apiKey);
  });
});

describe('WAHA session reads for the connection test', () => {
  it('lookupWahaPhone returns the status and the digits of me.id', async () => {
    const config = makeConfig();
    const fetchImpl = fetchWithSession(workingSession());

    expect(await lookupWahaPhone(config, fetchImpl)).toEqual({ ok: true, status: 'WORKING', phone: '2348037000101' });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${config.baseUrl}/api/sessions/default`);
  });

  it('lookupWahaPhone returns a null phone while no handset is paired', async () => {
    const fetchImpl = fetchWithSession(jsonResponse({ name: 'default', status: 'SCAN_QR_CODE', me: null }));

    expect(await lookupWahaPhone(makeConfig(), fetchImpl)).toEqual({ ok: true, status: 'SCAN_QR_CODE', phone: null });
  });

  it('lookupWahaPhone reports the HTTP status of a rejected call', async () => {
    const fetchImpl = fetchWithSession(jsonResponse({}, 401));

    expect(await lookupWahaPhone(makeConfig(), fetchImpl)).toEqual({ ok: false, httpStatus: 401 });
  });

  it('encodes the session name in the path', async () => {
    const config = makeConfig({ session: 'estate one' });
    const fetchImpl = fetchWithSession(workingSession());

    await lookupWahaPhone(config, fetchImpl);

    expect(fetchImpl.mock.calls[0][0]).toBe(`${config.baseUrl}/api/sessions/estate%20one`);
  });

  it('fetchWahaConnectionStatus returns the status, or unknown after an HTTP error', async () => {
    expect(await fetchWahaConnectionStatus(makeConfig(), fetchWithSession(workingSession()))).toBe('WORKING');
    expect(await fetchWahaConnectionStatus(makeConfig(), fetchWithSession(jsonResponse({}, 500)))).toBe('unknown');
  });
});

describe('lookupWahaLidPhone (#1282)', () => {
  const lid = '98765432109876@lid';

  it('asks for the lid with @ escaped as %40 and returns its pn', async () => {
    const config = makeConfig();
    const fetchImpl = vi.fn(async () => jsonResponse({ lid, pn: '2348000000000@c.us' }));

    expect(await lookupWahaLidPhone(config, lid, fetchImpl as unknown as typeof fetch)).toBe('2348000000000@c.us');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${config.baseUrl}/api/default/lids/98765432109876%40lid`);
    expect(init.headers).toEqual({ 'X-Api-Key': 'waha-super-secret-key' });
  });

  it.each([
    ['WAHA knows no number (pn null)', { lid, pn: null }],
    ['the answer names another lid', { lid: '11111111111@lid', pn: '2348000000000@c.us' }],
    ['the answer has no lid', { pn: '2348000000000@c.us' }],
    ['the body is not JSON', 'not json'],
  ])('returns null when %s', async (_label, body) => {
    const fetchImpl = vi.fn(async () => (typeof body === 'string' ? new Response(body) : jsonResponse(body)));

    expect(await lookupWahaLidPhone(makeConfig(), lid, fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it('throws on a non-2xx answer, naming only the status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'boom' }, 500));
    const error = await lookupWahaLidPhone(makeConfig(), lid, fetchImpl as unknown as typeof fetch).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('WAHA LID lookup failed (HTTP 500)');
  });
});
