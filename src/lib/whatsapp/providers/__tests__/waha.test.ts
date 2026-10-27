import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWahaWhatsAppProvider, lookupWahaPhone } from '@/lib/whatsapp/providers/waha';
import { isProviderSupported } from '@/lib/whatsapp/provider';
import type { WahaWhatsAppConfig } from '@/lib/whatsapp/config';

const API_KEY = 'waha-super-secret-key'; // secret-scan:allow test fixture

// The session check is cached in module scope by baseUrl|session|key; a fresh
// baseUrl per test keeps that cache from leaking between tests.
let counter = 0;
function makeConfig(overrides: Partial<WahaWhatsAppConfig> = {}): WahaWhatsAppConfig {
  counter += 1;
  return {
    provider: 'waha',
    apiKey: API_KEY,
    webhookSecret: 'hmac',
    baseUrl: `https://waha.test/${counter}`,
    session: 'default',
    fromNumber: '+2348037000101',
    ...overrides,
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const working = () => json({ name: 'default', status: 'WORKING', me: { id: '2348037000101@c.us' } });

function fetchQueue(...responses: Response[]) {
  const fetchImpl = vi.fn();
  for (const response of responses) fetchImpl.mockResolvedValueOnce(response);
  return fetchImpl;
}

function bodyOf(fetchImpl: ReturnType<typeof vi.fn>, call: number) {
  return JSON.parse((fetchImpl.mock.calls[call][1] as RequestInit).body as string);
}

afterEach(() => vi.useRealTimers());

describe('WAHA WhatsApp provider', () => {
  it('is registered as a supported provider', () => {
    expect(isProviderSupported(makeConfig())).toBe(true);
  });

  it('checks the session, then sends text to <digits>@c.us with the X-Api-Key header', async () => {
    const config = makeConfig();
    const fetchImpl = fetchQueue(working(), json({ id: 'true_2348000000000@c.us_ABC' }, 201));

    const result = await createWahaWhatsAppProvider(config, fetchImpl).sendText({ to: '+2348000000000', body: 'Hello' });

    expect(result).toEqual({ success: true, messageId: 'true_2348000000000@c.us_ABC' });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${config.baseUrl}/api/sessions/default`);
    expect(fetchImpl.mock.calls[1][0]).toBe(`${config.baseUrl}/api/sendText`);
    for (const [, init] of fetchImpl.mock.calls) {
      expect((init as RequestInit).headers).toMatchObject({ 'X-Api-Key': API_KEY });
    }
    expect(bodyOf(fetchImpl, 1)).toEqual({ session: 'default', chatId: '2348000000000@c.us', text: 'Hello' });
  });

  it('sends the text first, then one sendFile per URL with the caption on the first only', async () => {
    const config = makeConfig();
    const fetchImpl = fetchQueue(working(), json({ id: 'text-id' }), json({ id: 'file-1' }), json({ id: 'file-2' }));
    const urls = ['https://files.test/a/statement.pdf?token=x', 'https://files.test/b/receipt.pdf'];

    const result = await createWahaWhatsAppProvider(config, fetchImpl).sendText({
      to: '+2348000000000',
      body: 'Your statement',
      mediaUrls: urls,
    });

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
      file: { url: urls[0], mimetype: 'application/pdf', filename: 'statement.pdf' },
      caption: 'Your statement',
    });
    expect(bodyOf(fetchImpl, 3)).toEqual({
      session: 'default',
      chatId: '2348000000000@c.us',
      file: { url: urls[1], mimetype: 'application/pdf', filename: 'receipt.pdf' },
    });
  });

  it('renders a template to text with the shared renderer', async () => {
    const fetchImpl = fetchQueue(working(), json({ id: 'tpl-id' }));

    const result = await createWahaWhatsAppProvider(makeConfig(), fetchImpl).sendTemplate({
      to: '+2348000000000',
      templateName: 'announcement',
      languageCode: 'en',
      parameters: ['Water outage', 'No water on Friday'],
    });

    expect(result.success).toBe(true);
    expect(bodyOf(fetchImpl, 1).text).toBe('Water outage\n\nNo water on Friday');
  });

  it('caches the session check for 30 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-27T10:00:00Z'));
    const config = makeConfig();
    const fetchImpl = fetchQueue(working(), json({ id: '1' }), json({ id: '2' }), working(), json({ id: '3' }));
    const provider = createWahaWhatsAppProvider(config, fetchImpl);

    await provider.sendText({ to: '+2348000000000', body: 'a' });
    vi.setSystemTime(Date.parse('2026-10-27T10:00:29Z'));
    await provider.sendText({ to: '+2348000000000', body: 'b' });
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/api/sessions/default'))).toHaveLength(1);

    vi.setSystemTime(Date.parse('2026-10-27T10:00:31Z'));
    await provider.sendText({ to: '+2348000000000', body: 'c' });
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/api/sessions/default'))).toHaveLength(2);
  });

  it.each(['SCAN_QR_CODE', 'STOPPED', 'FAILED', 'STARTING'])('refuses to send while the session is %s', async (status) => {
    const fetchImpl = fetchQueue(json({ status }));

    const result = await createWahaWhatsAppProvider(makeConfig(), fetchImpl).sendText({ to: '+2348000000000', body: 'x' });

    expect(result).toEqual({ success: false, error: 'WAHA bridge is disconnected' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats a transport error on the session check as disconnected', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await createWahaWhatsAppProvider(makeConfig(), fetchImpl).sendText({ to: '+2348000000000', body: 'x' });
    expect(result).toEqual({ success: false, error: 'WAHA bridge is disconnected' });
  });

  it('marks 429 and 5xx retryable and other 4xx not', async () => {
    const send = async (status: number) =>
      createWahaWhatsAppProvider(makeConfig(), fetchQueue(working(), json({ message: 'nope' }, status))).sendText({
        to: '+2348000000000',
        body: 'x',
      });

    expect(await send(429)).toMatchObject({ success: false, retryable: true });
    expect(await send(503)).toMatchObject({ success: false, retryable: true });
    expect(await send(400)).toMatchObject({ success: false, retryable: false });
  });

  it('fails without retry when WAHA returns no message id', async () => {
    const result = await createWahaWhatsAppProvider(makeConfig(), fetchQueue(working(), json({}))).sendText({
      to: '+2348000000000',
      body: 'x',
    });
    expect(result).toEqual({ success: false, error: 'WAHA provider returned no message ID', retryable: false });
  });

  it('reads a NOWEB key-shaped response as the serialised ack id', async () => {
    const fetchImpl = fetchQueue(working(), json({ key: { remoteJid: '2348000000000@s.whatsapp.net', fromMe: true, id: 'XYZ' } }));
    const result = await createWahaWhatsAppProvider(makeConfig(), fetchImpl).sendText({ to: '+2348000000000', body: 'x' });
    expect(result).toEqual({ success: true, messageId: 'true_2348000000000@c.us_XYZ' });
  });

  it('never puts the API key in an error', async () => {
    const errors = await Promise.all([
      createWahaWhatsAppProvider(makeConfig(), fetchQueue(json({ status: 'STOPPED' }))).sendText({ to: '+2348000000000', body: 'x' }),
      createWahaWhatsAppProvider(makeConfig(), fetchQueue(working(), json({ message: 'bad' }, 401))).sendText({ to: '+2348000000000', body: 'x' }),
      createWahaWhatsAppProvider(makeConfig(), fetchQueue(working(), json({}, 500))).sendText({ to: '+2348000000000', body: 'x' }),
      createWahaWhatsAppProvider(makeConfig(), fetchQueue(working(), json({}))).sendText({ to: '+2348000000000', body: 'x' }),
      createWahaWhatsAppProvider(makeConfig(), vi.fn().mockResolvedValueOnce(working()).mockRejectedValueOnce(new Error(API_KEY)))
        .sendText({ to: '+2348000000000', body: 'x' }),
    ]);
    for (const result of errors) {
      expect(result.success).toBe(false);
      expect(JSON.stringify(result)).not.toContain(API_KEY);
    }
  });

  it('looks up the paired number from me.id, digits only', async () => {
    await expect(lookupWahaPhone(makeConfig(), fetchQueue(working()))).resolves.toEqual({
      ok: true,
      status: 'WORKING',
      pairedNumber: '2348037000101',
    });
    await expect(lookupWahaPhone(makeConfig(), fetchQueue(json({}, 401)))).resolves.toEqual({ ok: false });
  });
});
