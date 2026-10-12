import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyWebhookSignature } from '@/lib/paystack/client';

const SECRET = 'whsec_test_secret';
const BODY = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_1' } });
const sign = (body: string, secret = SECRET) =>
  createHmac('sha512', secret).update(body).digest('hex');

describe('verifyWebhookSignature (#456)', () => {
  const original = process.env.PAYSTACK_WEBHOOK_SECRET;
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    if (original === undefined) delete process.env.PAYSTACK_WEBHOOK_SECRET;
    else process.env.PAYSTACK_WEBHOOK_SECRET = original;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(['development', 'test', 'production'])(
    'rejects when the secret is unset (NODE_ENV=%s)',
    async (env) => {
      vi.stubEnv('NODE_ENV', env);
      delete process.env.PAYSTACK_WEBHOOK_SECRET;
      expect(await verifyWebhookSignature(BODY, sign(BODY))).toBe(false);
      expect(await verifyWebhookSignature(BODY, '')).toBe(false);
    }
  );

  it('accepts a valid signature when the secret is set', async () => {
    process.env.PAYSTACK_WEBHOOK_SECRET = SECRET;
    expect(await verifyWebhookSignature(BODY, sign(BODY))).toBe(true);
  });

  it('rejects wrong, truncated, empty and tampered-body signatures', async () => {
    process.env.PAYSTACK_WEBHOOK_SECRET = SECRET;
    expect(await verifyWebhookSignature(BODY, sign(BODY, 'other'))).toBe(false);
    expect(await verifyWebhookSignature(BODY, sign(BODY).slice(0, 64))).toBe(false);
    expect(await verifyWebhookSignature(BODY, '')).toBe(false);
    expect(await verifyWebhookSignature(BODY + ' ', sign(BODY))).toBe(false);
  });
});
