import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const twilioConfig = {
  provider: 'twilio' as const,
  accountSid: 'AC-test-sid',
  authToken: 'test-auth-token',
  fromNumber: '+15550001111',
  templateContentSids: {},
};

const publicUrl = 'https://residio.test/api/whatsapp/webhook/twilio';
const recordSystemAction = vi.fn();

function signFor(url: string, body: Record<string, string>, token: string): string {
  const payload = Object.keys(body)
    .sort()
    .reduce((acc, key) => acc + key + body[key], url);
  return createHmac('sha1', token).update(payload, 'utf8').digest('base64');
}

function post(params: Record<string, string>, token = twilioConfig.authToken): NextRequest {
  return new NextRequest(publicUrl, {
    method: 'POST',
    headers: { 'x-twilio-signature': signFor(publicUrl, params, token) },
    body: new URLSearchParams(params).toString(),
  });
}

async function load(options: { failClaims?: boolean } = {}) {
  vi.doMock('@/lib/whatsapp/config-db', () => ({
    loadWhatsAppConfigFromDb: vi.fn().mockResolvedValue({ status: 'ok', config: twilioConfig }),
  }));
  vi.doMock('@/lib/system-log/recorder', () => ({ recordSystemAction }));
  const inbound = await vi.importActual<typeof import('@/lib/whatsapp/inbound')>('@/lib/whatsapp/inbound');
  const store = inbound.createInMemoryProcessedMessageStore();
  vi.doMock('@/lib/whatsapp', async () => ({
    ...(await vi.importActual<typeof import('@/lib/whatsapp')>('@/lib/whatsapp')),
    createSupabaseProcessedMessageStore: () => ({
      claim: async (id: string, at: string) => {
        if (options.failClaims) throw new Error('db down');
        return store.claim(id, at);
      },
      release: async (id: string) => store.release?.(id),
    }),
    createSupabaseWhatsAppIdentityRepository: () => ({}),
    createSupabaseWhatsAppFinancialRepository: () => ({}),
    handleResidentMessage: vi.fn().mockResolvedValue(undefined),
  }));
  return (await import('@/app/api/whatsapp/webhook/twilio/route')).POST;
}

describe('Twilio WhatsApp webhook system action log', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    recordSystemAction.mockReset();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/whatsapp');
    vi.doUnmock('@/lib/system-log/recorder');
  });

  const message = { MessageSid: 'SM1', From: 'whatsapp:+2348000000000', Body: 'balance' };

  it('records nothing for a request with an invalid signature', async () => {
    const POST = await load();
    const response = await POST(post(message, 'not-the-token'));
    expect(response.status).toBe(401);
    expect(recordSystemAction).not.toHaveBeenCalled();
  }, 15_000);

  it('records one success row with counts, and no phone number or message text', async () => {
    const POST = await load();
    const response = await POST(post(message));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    const entry = recordSystemAction.mock.calls[0][0];
    expect(entry).toMatchObject({
      source: 'webhook:whatsapp-twilio',
      action: 'inbound_messages',
      outcome: 'success',
      summary: { processed: 1, duplicates: 0, ignored: 0 },
    });
    expect(JSON.stringify(entry)).not.toContain('2348000000000');
    expect(JSON.stringify(entry)).not.toContain('balance');
  });

  it('records nothing when the delivery carries no message', async () => {
    const POST = await load();
    const response = await POST(post({ From: 'whatsapp:+2348000000000', Body: 'Hello' }));
    expect(response.status).toBe(200);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records a failure row when processing fails, and the response stays 500', async () => {
    const POST = await load({ failClaims: true });
    const response = await POST(post(message));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'webhook:whatsapp-twilio',
        outcome: 'failure',
        error: 'Inbound WhatsApp message could not be processed',
      })
    );
  });
});
