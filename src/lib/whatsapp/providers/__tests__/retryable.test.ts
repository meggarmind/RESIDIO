/**
 * #546 -- providers tell the notification queue whether a failure is worth
 * retrying: 5xx/429/408 yes, any other 4xx no, a 2xx with no message id no
 * (the message may already have been accepted, so a retry could duplicate it).
 */
import { describe, expect, it, vi } from 'vitest';
import { isRetryableHttpStatus } from '@/lib/whatsapp/retry';
import { createMetaWhatsAppProvider } from '@/lib/whatsapp/providers/meta';
import { createTwilioWhatsAppProvider } from '@/lib/whatsapp/providers/twilio';
import type { MetaWhatsAppConfig, TwilioWhatsAppConfig } from '@/lib/whatsapp/config';

const meta: MetaWhatsAppConfig = {
  provider: 'meta',
  accessToken: 'token',
  phoneNumberId: 'phone-id',
  verifyToken: 'verify',
  appSecret: 'secret',
  apiVersion: 'v23.0',
  graphBaseUrl: 'https://graph.example.test',
};

const twilio: TwilioWhatsAppConfig = {
  provider: 'twilio',
  accountSid: 'AC-test',
  authToken: 'auth',
  fromNumber: '+15550001111',
  templateContentSids: { invoice_reminder: 'HX-1' },
};

const STATUSES: Array<[number, boolean]> = [
  [500, true],
  [503, true],
  [429, true],
  [408, true],
  [400, false],
  [401, false],
  [404, false],
];

describe('isRetryableHttpStatus', () => {
  it.each(STATUSES)('status %i -> %s', (status, expected) => {
    expect(isRetryableHttpStatus(status)).toBe(expected);
  });
});

describe('provider retryable flag', () => {
  it.each(STATUSES)('meta sendText HTTP %i -> retryable %s', async (status, expected) => {
    const provider = createMetaWhatsAppProvider(meta, vi.fn().mockResolvedValue(new Response('x', { status })));
    await expect(provider.sendText({ to: '2348000000000', body: 'Hi' })).resolves.toMatchObject({
      success: false,
      retryable: expected,
    });
  });

  it.each(STATUSES)('meta sendTemplate HTTP %i -> retryable %s', async (status, expected) => {
    const provider = createMetaWhatsAppProvider(meta, vi.fn().mockResolvedValue(new Response('x', { status })));
    await expect(
      provider.sendTemplate({ to: '2348000000000', templateName: 'invoice_reminder', languageCode: 'en_US', parameters: [] })
    ).resolves.toMatchObject({ success: false, retryable: expected });
  });

  it.each(STATUSES)('twilio sendText HTTP %i -> retryable %s', async (status, expected) => {
    const provider = createTwilioWhatsAppProvider(twilio, vi.fn().mockResolvedValue(new Response('x', { status })));
    await expect(provider.sendText({ to: '2348000000000', body: 'Hi' })).resolves.toMatchObject({
      success: false,
      retryable: expected,
    });
  });

  it('a 2xx without a message id is not retryable (it may have been accepted)', async () => {
    const ok = () => new Response(JSON.stringify({}), { status: 200 });
    const m = createMetaWhatsAppProvider(meta, vi.fn().mockResolvedValue(ok()));
    await expect(m.sendText({ to: '2348000000000', body: 'Hi' })).resolves.toMatchObject({ retryable: false });
    const t = createTwilioWhatsAppProvider(twilio, vi.fn().mockResolvedValue(ok()));
    await expect(t.sendText({ to: '2348000000000', body: 'Hi' })).resolves.toMatchObject({ retryable: false });
  });

  it('a success carries no retryable flag', async () => {
    const provider = createMetaWhatsAppProvider(
      meta,
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }))
    );
    await expect(provider.sendText({ to: '2348000000000', body: 'Hi' })).resolves.toEqual({
      success: true,
      messageId: 'wamid.1',
    });
  });
});
