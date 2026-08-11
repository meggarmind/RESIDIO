import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/whatsapp/webhook/route';

const verifyToken = 'test-verify-token';
const appSecret = 'test-app-secret';

const payload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [],
});

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(url, init);
}

describe('WhatsApp webhook route', () => {
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'test-access-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'test-phone-number-id');
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', verifyToken);
    vi.stubEnv('WHATSAPP_APP_SECRET', appSecret);
  });

  it('completes the Meta verification handshake', async () => {
    const response = await GET(
      request(
        `https://residio.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=challenge-123`
      )
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('challenge-123');
  });

  it('rejects an invalid verification token', async () => {
    const response = await GET(
      request(
        'https://residio.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123'
      )
    );

    expect(response.status).toBe(403);
  });

  it('rejects an invalid request signature', async () => {
    const response = await POST(
      request('https://residio.test/api/whatsapp/webhook', {
        method: 'POST',
        headers: { 'x-hub-signature-256': 'sha256-' + '0'.repeat(64) },
        body: payload,
      })
    );

    expect(response.status).toBe(401);
  });

  it('acknowledges a valid webhook payload', async () => {
    const signature = createHmac('sha256', appSecret).update(payload).digest('hex');
    const response = await POST(
      request('https://residio.test/api/whatsapp/webhook', {
        method: 'POST',
        headers: { 'x-hub-signature-256': `sha256=${signature}` },
        body: payload,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ received: true, processed: true });
  });
});
