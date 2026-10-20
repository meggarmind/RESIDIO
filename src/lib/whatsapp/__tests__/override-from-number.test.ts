import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadOverrideSettings: vi.fn(),
  resolveWhatsAppConfig: vi.fn(),
  sendText: vi.fn(),
  sendTemplate: vi.fn(),
}));

vi.mock('@/lib/comms-override/settings', () => ({ loadOverrideSettings: mocks.loadOverrideSettings }));
vi.mock('@/lib/whatsapp/config', () => ({ resolveWhatsAppConfig: mocks.resolveWhatsAppConfig }));
vi.mock('@/lib/whatsapp/providers/chatmaid', () => ({
  createChatmaidWhatsAppProvider: () => ({ sendText: mocks.sendText, sendTemplate: mocks.sendTemplate }),
}));
vi.mock('@/lib/whatsapp/outbound-sends', () => ({ recordOutboundSend: vi.fn() }));

import { sendWhatsAppMessage, sendWhatsAppTemplate } from '@/lib/whatsapp/provider';

const FROM = '+2348037000101';
const text = { to: '+2348099999999', body: 'hello' };
const template = { to: '+2348099999999', templateName: 'x', languageCode: 'en', bodyParameters: [] } as never;

function overrides(over: { phone?: string; whatsappPhone?: string } = {}) {
  mocks.loadOverrideSettings.mockResolvedValue({
    status: 'ok',
    settings: {
      enabled: false,
      email: 'o@example.test',
      phone: '+15550100100',
      whatsappPhone: '',
      debugMode: false,
      debugExpiresAt: null,
      ...over,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
  mocks.resolveWhatsAppConfig.mockResolvedValue({
    status: 'ok',
    config: { provider: 'chatmaid', apiKey: 'k', webhookSecret: 's', baseUrl: 'https://x.test', fromNumber: FROM },
  });
  mocks.sendText.mockResolvedValue({ success: true, messageId: 'm1' });
  mocks.sendTemplate.mockResolvedValue({ success: true, messageId: 'm2' });
  overrides();
});

afterEach(() => vi.unstubAllEnvs());

describe('WhatsApp send-time block on a redirect to the from-number (#904)', () => {
  it('blocks a text send whose redirect target is the from-number, naming the cause', async () => {
    overrides({ whatsappPhone: FROM });
    const result = await sendWhatsAppMessage(text);
    expect(result.success).toBe(false);
    expect(result.error).toContain('is the WhatsApp from-number');
    expect(result.retryable).toBe(false);
    expect(result.override).toMatchObject({ blocked: true, original: text.to, actual: null });
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it('blocks a template send the same way', async () => {
    overrides({ whatsappPhone: FROM });
    const result = await sendWhatsAppTemplate(template);
    expect(result.success).toBe(false);
    expect(result.error).toContain('is the WhatsApp from-number');
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it('blocks through the override-phone fallback when the WhatsApp override number is blank', async () => {
    overrides({ phone: FROM, whatsappPhone: '' });
    const result = await sendWhatsAppMessage(text);
    expect(result.success).toBe(false);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it('sends when the redirect target differs from the from-number', async () => {
    overrides({ whatsappPhone: '+15550100200' });
    const result = await sendWhatsAppMessage(text);
    expect(result.success).toBe(true);
    expect(mocks.sendText.mock.calls[0][0].to).toBe('+15550100200');
  });
});
