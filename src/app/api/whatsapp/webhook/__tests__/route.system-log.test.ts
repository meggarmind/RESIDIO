import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/whatsapp/webhook/route';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/lib/whatsapp/config-db', () => ({
  loadWhatsAppConfigFromDb: async () => ({ status: 'absent' }),
}));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

const handleResidentMessage = vi.fn();
let failClaims = false;

vi.mock('@/lib/whatsapp', async () => {
  const actual = await vi.importActual<typeof import('@/lib/whatsapp')>('@/lib/whatsapp');
  const inbound = await vi.importActual<typeof import('@/lib/whatsapp/inbound')>('@/lib/whatsapp/inbound');
  const store = inbound.createInMemoryProcessedMessageStore();
  return {
    ...actual,
    createSupabaseProcessedMessageStore: () => ({
      claim: async (id: string, at: string) => {
        if (failClaims) throw new Error('db down');
        return store.claim(id, at);
      },
      release: async (id: string) => store.release?.(id),
    }),
    createSupabaseWhatsAppIdentityRepository: () => ({}),
    createSupabaseWhatsAppFinancialRepository: () => ({}),
    handleResidentMessage: (...args: unknown[]) => handleResidentMessage(...args),
  };
});

const appSecret = 'test-app-secret';

function body(messageId: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: messageId, from: '2348000000000', timestamp: '1', type: 'text', text: { body: 'balance' } },
              ],
            },
          },
        ],
      },
    ],
  });
}

function signed(payload: string, secret = appSecret): NextRequest {
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return new NextRequest('https://residio.test/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': `sha256=${signature}` },
    body: payload,
  });
}

describe('WhatsApp (Meta) webhook system action log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    failClaims = false;
    handleResidentMessage.mockResolvedValue(undefined);
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-access-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'test-phone-number-id');
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'test-verify-token');
    vi.stubEnv('WHATSAPP_APP_SECRET', appSecret);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('records nothing for a request with an invalid signature', async () => {
    const response = await POST(signed(body('wamid.1'), 'not-the-secret'));
    expect(response.status).toBe(401);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records one success row with counts, and no phone number or message text', async () => {
    const response = await POST(signed(body('wamid.2')));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(recordSystemAction).mock.calls[0][0];
    expect(entry).toMatchObject({
      source: 'webhook:whatsapp-meta',
      action: 'inbound_messages',
      outcome: 'success',
      summary: { processed: 1, duplicates: 0, ignored: 0 },
    });
    expect(JSON.stringify(entry)).not.toContain('2348000000000');
    expect(JSON.stringify(entry)).not.toContain('balance');
  });

  it('records nothing for a duplicate-only redelivery', async () => {
    await POST(signed(body('wamid.3')));
    vi.mocked(recordSystemAction).mockClear();
    const response = await POST(signed(body('wamid.3')));
    expect(response.status).toBe(200);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records a failure row when processing fails, and the response stays 500', async () => {
    failClaims = true;
    const response = await POST(signed(body('wamid.4')));
    expect(response.status).toBe(500);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'webhook:whatsapp-meta',
        outcome: 'failure',
        error: 'Inbound WhatsApp message could not be processed',
      })
    );
  });

  it('records a failure row for a signed but unparseable payload (400)', async () => {
    const response = await POST(signed('{not json'));
    expect(response.status).toBe(400);
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'webhook:whatsapp-meta',
        outcome: 'failure',
        error: 'Invalid webhook payload',
      })
    );
  });
});
