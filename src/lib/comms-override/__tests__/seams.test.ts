import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadOverrideSettings: vi.fn(),
  resendSend: vi.fn(),
  getSettingValueAsService: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/comms-override/settings', () => ({ loadOverrideSettings: mocks.loadOverrideSettings }));
vi.mock('@/lib/email/resend', () => ({
  resend: { emails: { send: mocks.resendSend } },
  emailConfig: { fromAddress: 'noreply@test.example', replyTo: 'reply@test.example' },
  isEmailConfigured: () => true,
}));
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: mocks.getSettingValueAsService }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: mocks.insert,
      select: () => {
        const q: Record<string, unknown> = { eq: () => q, gte: () => q, then: (r: (v: unknown) => unknown) => r({ count: 0, error: null }) };
        return q;
      },
    }),
  }),
}));
vi.mock('@/actions/settings/get-settings', () => ({ getSettings: vi.fn() }));
vi.mock('@/lib/sms/termii', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sms/termii')>();
  return {
    ...actual,
    termiiConfig: { apiKey: 'test-key', senderId: 'Residio', baseUrl: 'https://termii.example.test/api' },
    isSmsConfigured: () => true,
  };
});

import { sendViaResend } from '@/lib/email/transport';
import { sendEmail } from '@/lib/email/send-email';
import { sendSms, sendVerificationSms } from '@/lib/sms/send-sms';
import { sendWhatsAppMessage, sendWhatsAppTemplate, type WhatsAppProvider } from '@/lib/whatsapp/provider';
import type { OverrideSettings } from '@/lib/comms-override/types';

const OVERRIDE_EMAIL = 'override@example.test';
const OVERRIDE_PHONE = '+15550100100';
const OVERRIDE_WA = '+15550100200';

function settings(over: Partial<OverrideSettings> = {}) {
  mocks.loadOverrideSettings.mockResolvedValue({
    status: 'ok',
    settings: {
      enabled: false,
      email: OVERRIDE_EMAIL,
      phone: OVERRIDE_PHONE,
      whatsappPhone: '',
      debugMode: false,
      debugExpiresAt: null,
      ...over,
    },
  });
}

function fakeProvider(): WhatsAppProvider & { sendText: ReturnType<typeof vi.fn>; sendTemplate: ReturnType<typeof vi.fn> } {
  return {
    sendText: vi.fn().mockResolvedValue({ success: true, messageId: 'wa-1' }),
    sendTemplate: vi.fn().mockResolvedValue({ success: true, messageId: 'wa-2' }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
  mocks.resendSend.mockResolvedValue({ data: { id: 'rid-1' }, error: null });
  mocks.getSettingValueAsService.mockResolvedValue(null);
  mocks.insert.mockResolvedValue({ error: null });
  settings();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('email seam (sendViaResend)', () => {
  const attachments = [{ filename: 'report.pdf', content: Buffer.from('pdf') }];

  it('redirects to one override address, labels the message and keeps attachments', async () => {
    const result = await sendViaResend({
      to: ['a@example.test', 'b@example.test'],
      subject: 'Monthly report',
      html: '<p>Hi</p>',
      attachments,
    });

    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    const payload = mocks.resendSend.mock.calls[0][0];
    expect(payload.to).toBe(OVERRIDE_EMAIL);
    expect(payload.subject).toBe('[STAGE → a@example.test, b@example.test] Monthly report');
    expect(payload.html).toContain('STAGE environment');
    expect(payload.html.endsWith('<p>Hi</p>')).toBe(true);
    expect(payload.attachments).toBe(attachments);
    expect(payload.replyTo).toBe('reply@test.example');
    expect(result).toMatchObject({
      ok: true,
      override: { original: 'a@example.test, b@example.test', actual: OVERRIDE_EMAIL, reason: 'non_production' },
    });
  });

  it('blocks, and never calls Resend, when the override email is blank', async () => {
    settings({ email: '' });
    const result = await sendViaResend({ to: 'real@example.test', subject: 'S', html: 'x' });
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      error: 'comms override blocked: override email is blank or invalid',
      override: { original: 'real@example.test', actual: null, blocked: true },
    });
    expect((result as { retryable?: boolean }).retryable).toBeUndefined();
  });

  it('blocks and marks the failure retryable when the settings cannot be read', async () => {
    mocks.loadOverrideSettings.mockResolvedValue({ status: 'error', message: 'db down' });
    const result = await sendViaResend({ to: 'real@example.test', subject: 'S', html: 'x' });
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it('treats an unset NEXT_PUBLIC_APP_ENV as non-production and redirects', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', '');
    await sendViaResend({ to: 'real@example.test', subject: 'S', html: 'x' });
    expect(mocks.resendSend.mock.calls[0][0].to).toBe(OVERRIDE_EMAIL);
  });

  it('in production sends unchanged when the switch is off, and ignores nothing else', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    const result = await sendViaResend({ to: 'real@example.test', subject: 'S', html: 'x', attachments });
    const payload = mocks.resendSend.mock.calls[0][0];
    expect(payload.to).toBe('real@example.test');
    expect(payload.subject).toBe('S');
    expect(payload.html).toBe('x');
    expect(result).toEqual({ ok: true, id: 'rid-1', override: undefined });
  });

  it('in production redirects when the stored switch is on', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    settings({ enabled: true });
    await sendViaResend({ to: 'real@example.test', subject: 'S', html: 'x' });
    expect(mocks.resendSend.mock.calls[0][0].to).toBe(OVERRIDE_EMAIL);
  });

  it('sends a 2FA email to the original and never reads the override settings', async () => {
    await sendViaResend({ to: 'me@example.test', subject: 'Code', html: 'x' }, { purpose: 'self_auth_2fa' });
    expect(mocks.resendSend.mock.calls[0][0].to).toBe('me@example.test');
    expect(mocks.loadOverrideSettings).not.toHaveBeenCalled();
  });

  it('honours an explicit resident false on non-production by sending real', async () => {
    await sendViaResend({ to: 'real@example.test', subject: 'S', html: 'x' }, { residentOverride: false });
    expect(mocks.resendSend.mock.calls[0][0].to).toBe('real@example.test');
  });
});

describe('email logging (sendEmail)', () => {
  const recipient = { email: 'real@example.test', name: 'Real', residentId: 'res-1' };
  const react = { type: 'div', props: {} } as unknown as React.ReactElement;

  it('records original and actual in the log metadata, keeping the original as the recipient', async () => {
    const result = await sendEmail({ to: recipient, subject: 'S', react, emailType: 'test', metadata: { k: 'v' } });
    expect(result.success).toBe(true);
    const rows = mocks.insert.mock.calls.map((c) => c[0]);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.recipient_email).toBe('real@example.test');
      expect(row.metadata.override).toEqual({ original: 'real@example.test', actual: OVERRIDE_EMAIL, reason: 'non_production' });
    }
    expect(rows[0].metadata.k).toBe('v');
  });

  it('logs a blocked send as failed with the block message', async () => {
    settings({ email: '' });
    const result = await sendEmail({ to: recipient, subject: 'S', react, emailType: 'test' });
    expect(result).toMatchObject({ success: false, error: 'comms override blocked: override email is blank or invalid' });
    expect(mocks.resendSend).not.toHaveBeenCalled();
    const row = mocks.insert.mock.calls[0][0];
    expect(row).toMatchObject({
      status: 'failed',
      error_message: 'comms override blocked: override email is blank or invalid',
    });
    expect(row.metadata.override).toMatchObject({ blocked: true, actual: null });
  });
});

describe('SMS seam (sendSms)', () => {
  function stubTermii() {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'ok', message_id: 'm1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('redirects the number, prefixes the text, and logs the original with the actual in metadata', async () => {
    const fetchMock = stubTermii();
    const result = await sendSms({ to: { phone: '+15550100999' }, message: 'Pay now', smsType: 'notification' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe('15550100100');
    expect(body.sms).toBe('[STAGE → +15550100999] Pay now');
    expect(result.success).toBe(true);
    const row = mocks.insert.mock.calls[0][0];
    expect(row.recipient_phone).toBe('+15550100999');
    expect(row.metadata.override).toEqual({ original: '+15550100999', actual: OVERRIDE_PHONE, reason: 'non_production' });
  });

  it('sends each recipient its own labelled message to the override number', async () => {
    const fetchMock = stubTermii();
    await sendSms({ to: [{ phone: '+15550100991' }, { phone: '+15550100992' }], message: 'Hi', smsType: 'notification' });
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.map((b) => b.to)).toEqual(['15550100100', '15550100100']);
    expect(bodies.map((b) => b.sms)).toEqual(['[STAGE → +15550100991] Hi', '[STAGE → +15550100992] Hi']);
  });

  it('blocks without calling Termii when the override phone is blank', async () => {
    settings({ phone: '' });
    const fetchMock = stubTermii();
    const result = await sendSms({ to: { phone: '+15550100999' }, message: 'Pay now', smsType: 'notification' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('comms override blocked') });
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ status: 'failed' });
  });

  it('blocks when the settings cannot be read', async () => {
    mocks.loadOverrideSettings.mockResolvedValue({ status: 'error', message: 'db down' });
    const fetchMock = stubTermii();
    const result = await sendSms({ to: { phone: '+15550100999' }, message: 'x', smsType: 'notification' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it('sends a 2FA verification SMS to the original number, unlabelled', async () => {
    const fetchMock = stubTermii();
    await sendVerificationSms('+15550100999', '123456', undefined, { purpose: 'self_auth_2fa' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe('15550100999');
    expect(body.sms.startsWith('Your Residio verification code')).toBe(true);
    expect(mocks.loadOverrideSettings).not.toHaveBeenCalled();
  });

  it('without the 2FA purpose a verification SMS is redirected', async () => {
    const fetchMock = stubTermii();
    await sendVerificationSms('+15550100999', '123456');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toBe('15550100100');
  });
});

describe('WhatsApp seam (provider)', () => {
  const text = { to: '+15550100999', body: 'Hello' };
  const template = { to: '+15550100999', templateName: 'invoice_reminder', languageCode: 'en_US', parameters: ['a', 'b'] };

  it('redirects free-form text and prefixes it with the original', async () => {
    const provider = fakeProvider();
    const result = await sendWhatsAppMessage(text, provider);
    expect(provider.sendText).toHaveBeenCalledWith({ to: OVERRIDE_PHONE, body: '[STAGE → +15550100999] Hello' });
    expect(result.override).toEqual({ original: '+15550100999', actual: OVERRIDE_PHONE, reason: 'non_production' });
  });

  it('uses the separate WhatsApp number when one is set', async () => {
    settings({ whatsappPhone: OVERRIDE_WA });
    const provider = fakeProvider();
    await sendWhatsAppMessage(text, provider);
    expect(provider.sendText.mock.calls[0][0].to).toBe(OVERRIDE_WA);
  });

  it('redirects a template send without altering its parameters, and reports the original in the log record', async () => {
    const provider = fakeProvider();
    const result = await sendWhatsAppTemplate(template, provider);
    expect(provider.sendTemplate).toHaveBeenCalledWith({ ...template, to: OVERRIDE_PHONE });
    expect(result.override).toMatchObject({ original: '+15550100999', actual: OVERRIDE_PHONE });
  });

  it('blocks text and template sends when the override is blank, never reaching the provider', async () => {
    settings({ phone: '', whatsappPhone: '' });
    const provider = fakeProvider();
    const textResult = await sendWhatsAppMessage(text, provider);
    const templateResult = await sendWhatsAppTemplate(template, provider);
    expect(provider.sendText).not.toHaveBeenCalled();
    expect(provider.sendTemplate).not.toHaveBeenCalled();
    expect(textResult).toMatchObject({ success: false, error: expect.stringContaining('comms override blocked') });
    expect(templateResult).toMatchObject({ success: false, retryable: false });
  });

  it('blocks and allows a retry when the settings cannot be read', async () => {
    mocks.loadOverrideSettings.mockResolvedValue({ status: 'error', message: 'db down' });
    const provider = fakeProvider();
    const result = await sendWhatsAppTemplate(template, provider);
    expect(provider.sendTemplate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, retryable: true });
  });

  it('sends an inbound_reply text to the original, unlabelled, without reading the settings', async () => {
    const provider = fakeProvider();
    const result = await sendWhatsAppMessage(text, provider, { purpose: 'inbound_reply' });
    expect(provider.sendText).toHaveBeenCalledWith(text);
    expect(result.override).toBeUndefined();
    expect(mocks.loadOverrideSettings).not.toHaveBeenCalled();
  });

  it('sends an inbound_reply to the original even when the override is blank', async () => {
    settings({ phone: '', whatsappPhone: '' });
    const provider = fakeProvider();
    const result = await sendWhatsAppMessage(text, provider, { purpose: 'inbound_reply' });
    expect(result.success).toBe(true);
    expect(provider.sendText.mock.calls[0][0].to).toBe(text.to);
  });

  it('in production with the switch off sends to the original', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    const provider = fakeProvider();
    await sendWhatsAppTemplate(template, provider);
    expect(provider.sendTemplate).toHaveBeenCalledWith(template);
  });
});
