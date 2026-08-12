import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createMetaWhatsAppProvider,
  createWhatsAppSimulator,
  handleInboundMessage,
  verifyWhatsAppSignature,
  verifyWhatsAppToken,
} from '@/lib/whatsapp';
import type { WhatsAppConfig } from '@/lib/whatsapp/config';

const config: WhatsAppConfig = {
  accessToken: 'test-access-token',
  phoneNumberId: 'phone-number-id',
  verifyToken: 'verify-token',
  appSecret: 'app-secret',
  apiVersion: 'v23.0',
  graphBaseUrl: 'https://graph.example.test',
};

const inboundPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              {
                from: '2348000000000',
                id: 'wamid.test-1',
                timestamp: '1760000000',
                type: 'text',
                text: { body: 'Hello' },
              },
            ],
          },
        },
      ],
    },
  ],
} as const;

describe('WhatsApp channel foundation', () => {
  it('verifies Meta signatures and rejects malformed signatures', () => {
    const body = JSON.stringify(inboundPayload);
    const signature = createHmac('sha256', config.appSecret).update(body).digest('hex');

    expect(verifyWhatsAppSignature(body, `sha256=${signature}`, config.appSecret)).toBe(true);
    expect(verifyWhatsAppSignature(body, `sha256=${'0'.repeat(64)}`, config.appSecret)).toBe(false);
    expect(verifyWhatsAppSignature(body, signature, config.appSecret)).toBe(false);
  });

  it('verifies the webhook token without accepting a different length', () => {
    expect(verifyWhatsAppToken('verify-token', 'verify-token')).toBe(true);
    expect(verifyWhatsAppToken('wrong-token', 'verify-token')).toBe(false);
    expect(verifyWhatsAppToken(null, 'verify-token')).toBe(false);
  });

  it('processes a message once and deduplicates webhook redelivery', async () => {
    const simulator = createWhatsAppSimulator();

    const first = await simulator.receive(inboundPayload);
    const second = await simulator.receive(inboundPayload);

    expect(first).toMatchObject({ accepted: true, processedCount: 1, duplicateCount: 0 });
    expect(second).toMatchObject({ accepted: true, processedCount: 0, duplicateCount: 1 });
    expect(simulator.received).toHaveLength(1);
    expect(simulator.received[0]?.text).toBe('Hello');
  });

  it('allows a failed message handler to be retried', async () => {
    const store = {
      claim: vi.fn().mockResolvedValue('claimed'),
      release: vi.fn().mockResolvedValue(undefined),
    };
    const onMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);

    const first = await handleInboundMessage(inboundPayload, { store, onMessage });
    const second = await handleInboundMessage(inboundPayload, { store, onMessage });

    expect(first.accepted).toBe(false);
    expect(second.accepted).toBe(true);
    expect(store.release).toHaveBeenCalledWith('wamid.test-1');
    expect(onMessage).toHaveBeenCalledTimes(2);
  });

  it('acknowledges unsupported message types without invoking text handling', async () => {
    const onMessage = vi.fn();
    const payload = {
      entry: [{ changes: [{ value: { messages: [{ ...inboundPayload.entry[0].changes[0].value.messages[0], type: 'image', text: undefined }] } }] }],
    };

    const result = await handleInboundMessage(payload, {
      store: {
        claim: vi.fn().mockResolvedValue('claimed'),
      },
      onMessage,
    });

    expect(result).toMatchObject({ accepted: true, processedCount: 1, ignoredCount: 1 });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('sends a text message through the Meta provider without exposing the token in the payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.outbound-1' }] }), { status: 200 })
    );
    const provider = createMetaWhatsAppProvider(config, fetchImpl);

    const result = await provider.sendText({ to: '2348000000000', body: 'Test message' });

    expect(result).toEqual({ success: true, messageId: 'wamid.outbound-1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://graph.example.test/v23.0/phone-number-id/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }),
        body: expect.not.stringContaining('Bearer'),
      })
    );
    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '2348000000000',
      type: 'text',
      text: { preview_url: false, body: 'Test message' },
    });
  });

  it('captures simulator sends without provider credentials', async () => {
    const simulator = createWhatsAppSimulator();

    await expect(simulator.send({ to: '2348000000000', body: 'Simulated message' })).resolves.toEqual({
      success: true,
      messageId: 'simulated-1',
    });
    expect(simulator.sent).toEqual([{ to: '2348000000000', body: 'Simulated message' }]);
  });

  it('sends an approved template message with body parameters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.template-1' }] }), { status: 200 })
    );
    const provider = createMetaWhatsAppProvider(config, fetchImpl);

    await expect(provider.sendTemplate({
      to: '2348000000000',
      templateName: 'invoice_reminder',
      languageCode: 'en_US',
      parameters: ['Ada', 'INV-1'],
    })).resolves.toEqual({ success: true, messageId: 'wamid.template-1' });

    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string).template).toEqual({
      name: 'invoice_reminder',
      language: { code: 'en_US' },
      components: [{
        type: 'body',
        parameters: [{ type: 'text', text: 'Ada' }, { type: 'text', text: 'INV-1' }],
      }],
    });
  });

  it('returns a safe provider error when Meta rejects a request', async () => {
    const provider = createMetaWhatsAppProvider(
      config,
      vi.fn().mockResolvedValue(new Response('secret provider details', { status: 401 }))
    );

    await expect(provider.sendText({ to: '2348000000000', body: 'Test message' })).resolves.toEqual({
      success: false,
      error: 'WhatsApp provider request failed (HTTP 401)',
    });
  });
});
