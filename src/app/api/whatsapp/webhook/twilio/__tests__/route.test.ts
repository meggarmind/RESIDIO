import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const twilioConfig = {
  provider: 'twilio' as const,
  accountSid: 'AC-test-sid',
  authToken: 'test-auth-token',
  fromNumber: '+15550001111',
  templateContentSids: {},
};

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(url, init);
}

const publicUrl = 'https://residio.test/api/whatsapp/webhook/twilio';

// No `MessageSid`, so `extractTwilioMessages` yields no messages and
// `onMessage` (which would otherwise reach into Supabase via
// `handleResidentMessage`) never fires. This mirrors how the Meta route test
// exercises accept/reject with an empty `entry: []` payload -- the route's
// job under test here is signature verification and the response shape, not
// the downstream handler chain.
const params = { From: 'whatsapp:+2348000000000', Body: 'Hello' };
const rawBody = new URLSearchParams(params).toString();

function signFor(url: string, body: Record<string, string>, token: string): string {
  const payload = Object.keys(body)
    .sort()
    .reduce((acc, key) => acc + key + body[key], url);
  return createHmac('sha1', token).update(payload, 'utf8').digest('base64');
}

describe('Twilio WhatsApp webhook route', () => {
  beforeEach(() => {
    vi.resetModules();
    // Guard against a Meta env fallback masking the "unconfigured" case:
    // resolveWhatsAppConfig() falls back to WHATSAPP_* env vars when the DB
    // row is absent, and those must stay unset for that test to mean what it
    // says.
    vi.unstubAllEnvs();
  });

  it('accepts a valid signature, reconstructing the public URL from forwarded headers', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue({ status: 'ok', config: twilioConfig }),
    }));
    const { POST } = await import('@/app/api/whatsapp/webhook/twilio/route');

    // Simulate the app receiving the request behind a proxy: the internal
    // request URL differs from the public one Twilio actually signed
    // against, and only the forwarded headers carry the real host.
    const signature = signFor(publicUrl, params, twilioConfig.authToken);

    const response = await POST(
      request('http://internal-host:3000/api/whatsapp/webhook/twilio', {
        method: 'POST',
        headers: {
          'x-twilio-signature': signature,
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'residio.test',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ received: true, processed: true });
  });

  it('falls back to request.nextUrl when there are no forwarded headers', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue({ status: 'ok', config: twilioConfig }),
    }));
    const { POST } = await import('@/app/api/whatsapp/webhook/twilio/route');

    const signature = signFor(publicUrl, params, twilioConfig.authToken);

    const response = await POST(
      request(publicUrl, {
        method: 'POST',
        headers: { 'x-twilio-signature': signature },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
  });

  it('rejects an invalid signature with 401', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue({ status: 'ok', config: twilioConfig }),
    }));
    const { POST } = await import('@/app/api/whatsapp/webhook/twilio/route');

    const response = await POST(
      request(publicUrl, {
        method: 'POST',
        headers: {
          'x-twilio-signature': 'not-a-real-signature',
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'residio.test',
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(401);
  });

  it('returns 503 with the reason when stored credentials are unusable', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi
        .fn()
        .mockResolvedValue({ status: 'unusable', reason: 'decryption failed' }),
    }));
    const { POST } = await import('@/app/api/whatsapp/webhook/twilio/route');

    const response = await POST(
      request(publicUrl, {
        method: 'POST',
        headers: { 'x-twilio-signature': 'irrelevant' },
        body: rawBody,
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('decryption failed'),
    });
  });

  it('returns 503 when no provider is configured', async () => {
    vi.doMock('@/lib/whatsapp/config-db', () => ({
      loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue({ status: 'absent' }),
    }));
    const { POST } = await import('@/app/api/whatsapp/webhook/twilio/route');

    const response = await POST(
      request(publicUrl, {
        method: 'POST',
        headers: { 'x-twilio-signature': 'irrelevant' },
        body: rawBody,
      })
    );

    expect(response.status).toBe(503);
  });
});
