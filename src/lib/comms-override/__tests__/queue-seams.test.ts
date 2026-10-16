import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadOverrideSettings: vi.fn(),
  resendSend: vi.fn(),
  evaluateSendPolicy: vi.fn(),
  sendTemplate: vi.fn(),
}));

vi.mock('@/lib/comms-override/settings', () => ({ loadOverrideSettings: mocks.loadOverrideSettings }));
vi.mock('@/lib/email/resend', () => ({
  resend: { emails: { send: mocks.resendSend } },
  emailConfig: { fromAddress: 'noreply@test.example', replyTo: 'reply@test.example' },
  isEmailConfigured: () => true,
}));
vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: vi.fn().mockResolvedValue(null),
  getSettingResultAsService: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: vi.fn() }));
vi.mock('@/lib/whatsapp/send-policy', () => ({
  evaluateSendPolicy: mocks.evaluateSendPolicy,
  createSendPolicyFacts: vi.fn(() => ({})),
}));
vi.mock('@/lib/whatsapp/config', () => ({
  resolveWhatsAppConfig: vi.fn().mockResolvedValue({
    status: 'ok',
    config: { provider: 'meta', accessToken: 't', phoneNumberId: 'p', verifyToken: 'v', appSecret: 's', apiVersion: 'v23.0', graphBaseUrl: 'https://graph.example.test' },
  }),
}));
vi.mock('@/lib/whatsapp/providers/meta', () => ({
  createMetaWhatsAppProvider: () => ({ sendText: vi.fn(), sendTemplate: mocks.sendTemplate }),
}));

import { sendNotification } from '@/lib/notifications/send';
import { PRIORITY } from '@/lib/notifications/queue';

const ORIGINAL_PHONE = '+2348000000000';

function item(over: Record<string, unknown> = {}) {
  return {
    id: 'q-1',
    template_id: null,
    schedule_id: null,
    recipient_id: 'resident-1',
    recipient_email: 'real@example.test',
    recipient_phone: ORIGINAL_PHONE,
    channel: 'email' as const,
    subject: 'Invoice due',
    body: 'Please pay',
    html_body: null,
    variables: null,
    priority: PRIORITY.NORMAL,
    status: 'pending' as const,
    deduplication_key: null,
    dedup_window_minutes: null,
    scheduled_for: new Date().toISOString(),
    attempts: 0,
    max_attempts: 3,
    last_attempt_at: null,
    sent_at: null,
    error_message: null,
    metadata: { whatsapp_template: { name: 'invoice_reminder', languageCode: 'en_US', parameters: ['a'] } },
    created_at: new Date().toISOString(),
    created_by: null,
    ...over,
  };
}

function settings(over: Record<string, unknown> = {}) {
  mocks.loadOverrideSettings.mockResolvedValue({
    status: 'ok',
    settings: { enabled: false, email: 'override@example.test', phone: '+15550100100', whatsappPhone: '', debugMode: false, debugExpiresAt: null, ...over },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
  mocks.resendSend.mockResolvedValue({ data: { id: 'rid-1' }, error: null });
  mocks.sendTemplate.mockResolvedValue({ success: true, messageId: 'wa-1' });
  mocks.evaluateSendPolicy.mockResolvedValue({
    outcome: 'allow',
    normalizedPhone: ORIGINAL_PHONE,
    template: { name: 'invoice_reminder', languageCode: 'en_US', parameters: ['a'] },
  });
  settings();
});

afterEach(() => vi.unstubAllEnvs());

describe('queue email path (sendViaEmail)', () => {
  it('redirects and carries the override record in result.metadata for the history row', async () => {
    const result = await sendNotification(item());
    expect(mocks.resendSend.mock.calls[0][0].to).toBe('override@example.test');
    expect(result).toMatchObject({
      success: true,
      metadata: { override: { original: 'real@example.test', actual: 'override@example.test', reason: 'non_production' } },
    });
  });

  it('fails a blocked send with the block message and the blocked record', async () => {
    settings({ email: '' });
    const result = await sendNotification(item());
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      error: 'comms override blocked: override email is blank or invalid',
      metadata: { override: { blocked: true, actual: null } },
    });
    expect(result.retryable).toBeUndefined();
  });
});

describe('queue WhatsApp path (sendViaWhatsApp)', () => {
  it('evaluates the send policy against the ORIGINAL recipient, then redirects inside the provider seam', async () => {
    const result = await sendNotification(item({ channel: 'whatsapp' }));

    expect(mocks.evaluateSendPolicy).toHaveBeenCalledTimes(1);
    expect(mocks.evaluateSendPolicy.mock.calls[0][0]).toMatchObject({ recipientId: 'resident-1', recipientPhone: ORIGINAL_PHONE });
    expect(mocks.sendTemplate).toHaveBeenCalledTimes(1);
    expect(mocks.sendTemplate.mock.calls[0][0].to).toBe('+15550100100');
    expect(result).toMatchObject({
      success: true,
      metadata: { override: { original: ORIGINAL_PHONE, actual: '+15550100100' } },
    });
  });

  it('sends nothing when the policy refuses, even though a redirect target exists', async () => {
    mocks.evaluateSendPolicy.mockResolvedValue({ outcome: 'refuse', reason: 'no_opt_in', message: 'no consent' });
    const result = await sendNotification(item({ channel: 'whatsapp' }));
    expect(result).toMatchObject({ success: false, error: 'no consent' });
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
    expect(mocks.loadOverrideSettings).not.toHaveBeenCalled();
  });

  it('fails a blocked WhatsApp send without reaching the provider', async () => {
    settings({ phone: '', whatsappPhone: '' });
    const result = await sendNotification(item({ channel: 'whatsapp' }));
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('comms override blocked') });
  });
});
