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
// The communications override has its own tests; these specs cover the email sender.
vi.mock('@/lib/comms-override/gate', () => ({
  decideSend: async () => ({ result: { redirect: false }, envLabel: 'TEST' }),
  loadSnapshotFor: async () => ({ status: 'error', message: 'unused' }),
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
const buildStatementEmail = vi.hoisted(() => vi.fn());
const markStatementEmailSent = vi.hoisted(() => vi.fn());
const sendStatementEmailedNotice = vi.hoisted(() => vi.fn());
const markStatementEmailFailed = vi.hoisted(() => vi.fn());
const sendStatementEmailFailedNotice = vi.hoisted(() => vi.fn());
vi.mock('@/lib/whatsapp/statement-delivery', () => ({
  buildStatementEmail,
  markStatementEmailSent,
  sendStatementEmailedNotice,
  markStatementEmailFailed,
  sendStatementEmailFailedNotice,
}));

import { createAdminClient } from '@/lib/supabase/server';
import { createFakeSupabase } from './helpers/fake-supabase';
import { sendAndRecordNotification, sendNotification } from '@/lib/notifications/send';
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

  it('renders a queued WhatsApp statement at send time with its PDF attached (#804)', async () => {
    const attachment = { filename: 'statement.pdf', content: Buffer.from('%PDF') };
    buildStatementEmail.mockResolvedValue({ react: 'statement-email', attachments: [attachment] });

    const result = await sendNotification(buildEmailItem({ metadata: { whatsapp_statement_request_id: 'request-1' } }));

    expect(result).toEqual({ success: true, externalId: 'rid-9' });
    expect(buildStatementEmail).toHaveBeenCalledWith('request-1');
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ react: 'statement-email', attachments: [attachment] });
    expect(mocks.send.mock.calls[0][0]).not.toHaveProperty('text');
    expect(markStatementEmailSent).toHaveBeenCalledWith('request-1');
  });

  it('marks the statement request sent only after the email is out, and a failed mark does not fail the send (#917)', async () => {
    buildStatementEmail.mockResolvedValue({ react: 'statement-email', attachments: [] });
    mocks.send.mockResolvedValueOnce({ data: null, error: { message: 'rejected' } });
    const failed = await sendNotification(buildEmailItem({ metadata: { whatsapp_statement_request_id: 'request-1' } }));
    expect(failed).toMatchObject({ success: false });
    expect(markStatementEmailSent).not.toHaveBeenCalled();

    markStatementEmailSent.mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent = await sendNotification(buildEmailItem({ metadata: { whatsapp_statement_request_id: 'request-1' } }));
    expect(sent).toEqual({ success: true, externalId: 'rid-9' });
  });

  it('tells the resident once the statement email is out, naming the address on file, and not for a cancelled request (#1252)', async () => {
    buildStatementEmail.mockResolvedValue({ react: 'statement-email', attachments: [] });
    const item = buildEmailItem({ metadata: { whatsapp_statement_request_id: 'request-1' } });

    markStatementEmailSent.mockResolvedValueOnce(true);
    await sendNotification(item);
    expect(sendStatementEmailedNotice).toHaveBeenCalledTimes(1);
    expect(sendStatementEmailedNotice).toHaveBeenCalledWith('request-1', 'a@test.example');

    sendStatementEmailedNotice.mockClear();
    markStatementEmailSent.mockResolvedValueOnce(false);
    await sendNotification(item);
    expect(sendStatementEmailedNotice).not.toHaveBeenCalled();
  });

  it('does not fail the email when the WhatsApp notice throws (#1252)', async () => {
    buildStatementEmail.mockResolvedValue({ react: 'statement-email', attachments: [] });
    markStatementEmailSent.mockResolvedValueOnce(true);
    sendStatementEmailedNotice.mockRejectedValueOnce(new Error('chatmaid down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await sendNotification(buildEmailItem({ metadata: { whatsapp_statement_request_id: 'request-1' } }));
    expect(result).toEqual({ success: true, externalId: 'rid-9' });
  });

  it('leaves other emails alone, and retries when the statement cannot be built', async () => {
    await sendNotification(buildEmailItem());
    expect(buildStatementEmail).not.toHaveBeenCalled();
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ text: 'Plain body' });

    buildStatementEmail.mockRejectedValue(new Error('request missing'));
    const result = await sendNotification(buildEmailItem({ metadata: { whatsapp_statement_request_id: 'gone' } }));
    expect(result).toMatchObject({ success: false, error: 'request missing', retryable: true });
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

describe('statement email that ends failed (#1252)', () => {
  function statementItem(attempts: number) {
    return buildEmailItem({ id: 'queue-1', attempts, max_attempts: 3, metadata: { whatsapp_statement_request_id: 'request-1' } });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEmailConfigured.mockReturnValue(true);
    settings({});
    buildStatementEmail.mockRejectedValue(new Error('request missing'));
    const fake = createFakeSupabase({ notification_queue: [{ id: 'queue-1' }], notification_history: [] });
    vi.mocked(createAdminClient).mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>);
  });

  it('marks the request failed and tells the resident when no attempt is left', async () => {
    markStatementEmailFailed.mockResolvedValueOnce(true);
    await sendAndRecordNotification(statementItem(2));
    expect(markStatementEmailFailed).toHaveBeenCalledWith('request-1');
    expect(sendStatementEmailFailedNotice).toHaveBeenCalledTimes(1);
    expect(sendStatementEmailFailedNotice).toHaveBeenCalledWith('request-1');
  });

  it('sends no notice when the request was not queued any more', async () => {
    markStatementEmailFailed.mockResolvedValueOnce(false);
    await sendAndRecordNotification(statementItem(2));
    expect(sendStatementEmailFailedNotice).not.toHaveBeenCalled();
  });

  it('changes nothing while the queue row will be retried', async () => {
    await sendAndRecordNotification(statementItem(0));
    expect(markStatementEmailFailed).not.toHaveBeenCalled();
    expect(sendStatementEmailFailedNotice).not.toHaveBeenCalled();
  });
});
