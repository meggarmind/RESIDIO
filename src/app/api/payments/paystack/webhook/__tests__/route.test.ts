import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';
import { processPaystackWebhook } from '@/actions/paystack';
import { getWebhookSecret } from '@/lib/paystack/client';
import { recordSystemAction } from '@/lib/system-log/recorder';

vi.mock('@/actions/paystack', () => ({ processPaystackWebhook: vi.fn() }));
vi.mock('@/lib/paystack/client', () => ({ getWebhookSecret: vi.fn() }));
vi.mock('@/lib/system-log/recorder', () => ({ recordSystemAction: vi.fn() }));

function request(signature?: string): NextRequest {
  return new NextRequest('https://residio.test/api/payments/paystack/webhook', {
    method: 'POST',
    headers: signature ? { 'x-paystack-signature': signature } : {},
    body: JSON.stringify({ event: 'charge.success', data: { reference: 'ref-secret', customer: { email: 'a@b.c' } } }),
  });
}

describe('Paystack webhook system action log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWebhookSecret).mockReturnValue('whsec');
    vi.mocked(processPaystackWebhook).mockResolvedValue({
      success: true,
      action: 'payment_created',
      transaction_id: 'tx-1',
    } as never);
  });

  it('records nothing when the webhook secret is not configured', async () => {
    vi.mocked(getWebhookSecret).mockReturnValue(undefined as never);
    expect((await POST(request('sig'))).status).toBe(503);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records nothing when the signature header is missing', async () => {
    expect((await POST(request())).status).toBe(400);
    expect(processPaystackWebhook).not.toHaveBeenCalled();
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records nothing when the signature is invalid', async () => {
    vi.mocked(processPaystackWebhook).mockResolvedValue({ success: false, error: 'Invalid webhook signature' } as never);
    expect((await POST(request('bad'))).status).toBe(401);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records one success row with the action and transaction id only', async () => {
    const response = await POST(request('sig'));
    expect(response.status).toBe(200);
    expect(recordSystemAction).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(recordSystemAction).mock.calls[0][0];
    expect(entry).toMatchObject({
      source: 'webhook:paystack',
      action: 'payment_event',
      outcome: 'success',
      summary: { action: 'payment_created', transactionId: 'tx-1' },
    });
    expect(JSON.stringify(entry)).not.toContain('ref-secret');
    expect(JSON.stringify(entry)).not.toContain('a@b.c');
  });

  it.each(['ignored', 'already_processed'])('records nothing for a %s delivery', async (action) => {
    vi.mocked(processPaystackWebhook).mockResolvedValue({ success: true, action } as never);
    expect((await POST(request('sig'))).status).toBe(200);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records a failure row when processing fails, and still acknowledges with 200', async () => {
    vi.mocked(processPaystackWebhook).mockResolvedValue({ success: false, error: 'Transaction not found' } as never);
    const response = await POST(request('sig'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ received: true, processed: false });
    expect(recordSystemAction).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'webhook:paystack',
        outcome: 'failure',
        error: 'Transaction not found',
      })
    );
  });

  it('records nothing when the handler throws, since the signature may not have been verified', async () => {
    vi.mocked(processPaystackWebhook).mockRejectedValue(new Error('contains ref-secret'));
    const response = await POST(request('sig'));
    expect(response.status).toBe(200);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });

  it('records nothing when reading the request body throws', async () => {
    const broken = { headers: new Headers({ 'x-paystack-signature': 'sig' }), text: async () => { throw new Error('stream'); } };
    const response = await POST(broken as never);
    expect(response.status).toBe(200);
    expect(recordSystemAction).not.toHaveBeenCalled();
  });
});
