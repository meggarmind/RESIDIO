import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  isEmailConfigured: vi.fn(),
  getSettingValueAsService: vi.fn(),
}));

vi.mock('@/lib/email/resend', () => ({
  resend: { emails: { send: mocks.send } },
  emailConfig: { fromAddress: 'noreply@test.example', replyTo: 'reply@test.example' },
  isEmailConfigured: mocks.isEmailConfigured,
}));
vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: mocks.getSettingValueAsService,
  getSettingResultAsService: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppTemplate: vi.fn(),
  isApprovedWhatsAppTemplateName: vi.fn(),
}));
vi.mock('@/lib/whatsapp/config', () => ({ resolveWhatsAppConfig: vi.fn() }));
vi.mock('@/lib/whatsapp/rollout', () => ({ isWhatsAppRecipientAllowed: vi.fn() }));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: vi.fn() }));

import { sendNotification } from '@/lib/notifications/send';
import { PRIORITY } from '@/lib/notifications/queue';

function buildEmailItem(overrides: Partial<Parameters<typeof sendNotification>[0]> = {}) {
  return {
    id: 'queue-email',
    template_id: null,
    schedule_id: null,
    recipient_id: 'resident-1',
    recipient_email: 'a@test.example',
    recipient_phone: null,
    channel: 'email' as const,
    subject: 'Subject line',
    body: 'Plain body',
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
    metadata: null,
    created_at: new Date().toISOString(),
    created_by: null,
    ...overrides,
  };
}

function settings(values: Record<string, unknown>) {
  mocks.getSettingValueAsService.mockImplementation(async (key: string) => values[key] ?? null);
}

describe('sendViaEmail (through sendNotification)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEmailConfigured.mockReturnValue(true);
    mocks.send.mockResolvedValue({ data: { id: 'rid-9' }, error: null });
    settings({});
  });

  it('returns its own message and does not send when email_enabled is false', async () => {
    settings({ email_enabled: false });
    const result = await sendNotification(buildEmailItem());
    expect(result).toEqual({
      success: false,
      error: 'Email notifications are disabled in system settings',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('fails open when email_enabled is null/absent', async () => {
    const result = await sendNotification(buildEmailItem());
    expect(result).toEqual({ success: true, externalId: 'rid-9' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('returns the shared not-configured message', async () => {
    mocks.isEmailConfigured.mockReturnValue(false);
    const result = await sendNotification(buildEmailItem());
    expect(result).toEqual({
      success: false,
      error: 'Email service not configured (missing RESEND_API_KEY)',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('checks configuration before the recipient', async () => {
    mocks.isEmailConfigured.mockReturnValue(false);
    const result = await sendNotification(buildEmailItem({ recipient_email: null }));
    expect(result.error).toBe('Email service not configured (missing RESEND_API_KEY)');
  });

  it('rejects a missing recipient without sending', async () => {
    const result = await sendNotification(buildEmailItem({ recipient_email: null }));
    expect(result).toEqual({ success: false, error: 'No recipient email address provided' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('sends text when there is no html_body (exact args, fallback from-name)', async () => {
    await sendNotification(buildEmailItem());
    expect(mocks.send).toHaveBeenCalledWith({
      from: 'Residio Estate <noreply@test.example>',
      to: 'a@test.example',
      replyTo: 'reply@test.example',
      subject: 'Subject line',
      text: 'Plain body',
    }, { idempotencyKey: 'queue-email:1' });
    expect(Object.keys(mocks.send.mock.calls[0][0])).not.toContain('html');
  });

  it('sends html (and no text) when html_body is present', async () => {
    await sendNotification(buildEmailItem({ html_body: '<p>Hi</p>' }));
    const arg = mocks.send.mock.calls[0][0];
    expect(arg).toEqual({
      from: 'Residio Estate <noreply@test.example>',
      to: 'a@test.example',
      replyTo: 'reply@test.example',
      subject: 'Subject line',
      html: '<p>Hi</p>',
    });
    expect(Object.keys(arg)).not.toContain('text');
  });

  it('defaults the subject to Notification and uses a custom from-name', async () => {
    settings({ email_from_name: 'Palm Estate' });
    await sendNotification(buildEmailItem({ subject: null }));
    const arg = mocks.send.mock.calls[0][0];
    expect(arg.subject).toBe('Notification');
    expect(arg.from).toBe('Palm Estate <noreply@test.example>');
  });

  it('maps a Resend error to a failed result', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: 'rejected' } });
    const result = await sendNotification(buildEmailItem());
    expect(result).toEqual({ success: false, error: 'rejected' });
  });

  it('maps a thrown Error and a non-Error throw', async () => {
    mocks.send.mockRejectedValueOnce(new Error('network down'));
    expect(await sendNotification(buildEmailItem())).toEqual({
      success: false,
      error: 'network down',
      retryable: true,
    });
    mocks.send.mockRejectedValueOnce('boom');
    expect(await sendNotification(buildEmailItem())).toEqual({
      success: false,
      error: 'Unknown error sending email',
      retryable: true,
    });
  });

  it('returns a failed result (does not throw) when the from-name read fails', async () => {
    mocks.getSettingValueAsService.mockImplementation(async (key: string) => {
      if (key === 'email_from_name') throw new Error('settings down');
      return null;
    });
    const result = await sendNotification(buildEmailItem());
    expect(result).toEqual({ success: false, error: 'settings down', retryable: true });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
