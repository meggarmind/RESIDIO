import { describe, expect, it, vi } from 'vitest';
import { createTwilioWhatsAppProvider } from '@/lib/whatsapp/providers/twilio';
import type { TwilioWhatsAppConfig } from '@/lib/whatsapp/config';

const config: TwilioWhatsAppConfig = {
  provider: 'twilio',
  accountSid: 'AC-test-sid',
  authToken: 'test-auth-token',
  fromNumber: '+15550001111',
  templateContentSids: {
    invoice_reminder: 'HX-invoice-reminder',
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('Twilio WhatsApp provider', () => {
  it('sends a text message form-encoded with whatsapp: addressing on both ends', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ sid: 'SM-outbound-1' }));
    const provider = createTwilioWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '2348000000000', body: 'Test message' });

    expect(result).toEqual({ success: true, messageId: 'SM-outbound-1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC-test-sid/Messages.json',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      })
    );

    const call = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = new URLSearchParams(call.body as string);
    expect(body.get('To')).toBe('whatsapp:+2348000000000');
    expect(body.get('From')).toBe('whatsapp:+15550001111');
    expect(body.get('Body')).toBe('Test message');
  });

  it('sends a Basic auth header that decodes back to accountSid:authToken', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ sid: 'SM-outbound-2' }));
    const provider = createTwilioWhatsAppProvider(config, fetchImpl);

    await provider.sendText({ to: '2348000000000', body: 'Hi' });

    const call = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = call.headers as Record<string, string>;
    const authHeader = headers.Authorization;
    expect(authHeader).toMatch(/^Basic /);
    const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString('utf8');
    expect(decoded).toBe('AC-test-sid:test-auth-token');
  });

  it('does not double-prefix numbers that already carry + or whatsapp:', async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ sid: 'SM-outbound-3' }))
    );
    const provider = createTwilioWhatsAppProvider(config, fetchImpl);

    await provider.sendText({ to: '+2348000000000', body: 'Hi' });
    let call = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    let body = new URLSearchParams(call.body as string);
    expect(body.get('To')).toBe('whatsapp:+2348000000000');

    fetchImpl.mockClear();
    await provider.sendText({ to: 'whatsapp:+2348000000000', body: 'Hi' });
    call = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    body = new URLSearchParams(call.body as string);
    expect(body.get('To')).toBe('whatsapp:+2348000000000');
  });

  it('sends a mapped template with ContentSid and a 1-indexed ContentVariables map', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ sid: 'SM-template-1' }));
    const provider = createTwilioWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendTemplate({
      to: '2348000000000',
      templateName: 'invoice_reminder',
      languageCode: 'en_US',
      parameters: ['Ada', 'INV-1'],
    });

    expect(result).toEqual({ success: true, messageId: 'SM-template-1' });
    const call = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = new URLSearchParams(call.body as string);
    expect(body.get('ContentSid')).toBe('HX-invoice-reminder');
    expect(JSON.parse(body.get('ContentVariables') as string)).toEqual({
      '1': 'Ada',
      '2': 'INV-1',
    });
  });

  it('returns a failure naming the template and makes no fetch call for an unmapped template', async () => {
    const fetchImpl = vi.fn();
    const provider = createTwilioWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendTemplate({
      to: '2348000000000',
      templateName: 'unmapped_template',
      languageCode: 'en_US',
      parameters: [],
    });

    expect(result).toEqual({
      success: false,
      error: 'No Twilio Content SID configured for template "unmapped_template"',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns success:false on a non-ok HTTP response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('secret provider details', { status: 401 }));
    const provider = createTwilioWhatsAppProvider(config, fetchImpl);

    await expect(provider.sendText({ to: '2348000000000', body: 'Hi' })).resolves.toEqual({
      success: false,
      error: 'WhatsApp provider request failed (HTTP 401)',
    });
  });

  it('returns success:false when the response body has no sid', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const provider = createTwilioWhatsAppProvider(config, fetchImpl);

    await expect(provider.sendText({ to: '2348000000000', body: 'Hi' })).resolves.toEqual({
      success: false,
      error: 'WhatsApp provider returned no message ID',
    });
  });
});
