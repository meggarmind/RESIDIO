import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  isEmailConfigured: vi.fn(),
  getSettingValueAsService: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
  decideSend: vi.fn(),
}));

vi.mock('@/lib/email/resend', () => ({
  resend: { emails: { send: mocks.send } },
  emailConfig: { fromAddress: 'noreply@test.example', replyTo: 'reply@test.example' },
  isEmailConfigured: mocks.isEmailConfigured,
}));
// The communications override has its own tests; these specs cover sendEmail itself.
vi.mock('@/lib/comms-override/gate', () => ({
  decideSend: mocks.decideSend,
  loadSnapshotFor: async () => ({ status: 'error', message: 'unused' }),
}));
vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: mocks.getSettingValueAsService,
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/actions/settings/get-settings', () => ({ getSettings: vi.fn() }));

import { sendEmail } from '@/lib/email/send-email';
import { resolveRecipient } from '@/lib/comms-override/resolver';
import type { OverrideSettings } from '@/lib/comms-override/types';

const OVERRIDE_EMAIL = 'override@example.test';

/** Routes the gate through the real resolver, in production, with these settings. */
function useRealResolver(over: Partial<OverrideSettings>) {
  mocks.decideSend.mockImplementation(async (input) => ({
    result: resolveRecipient(
      input,
      {
        status: 'ok',
        settings: { enabled: false, email: OVERRIDE_EMAIL, phone: '+15550100100', whatsappPhone: '', debugMode: false, debugExpiresAt: null, ...over },
      },
      { isProduction: true }
    ),
    envLabel: 'PROD',
  }));
}

const recipient = { email: 'a@test.example', name: 'A', residentId: 'res-1' };
const react = { type: 'div', props: {} } as unknown as React.ReactElement;

function settings(values: Record<string, unknown>) {
  mocks.getSettingValueAsService.mockImplementation(async (key: string) => values[key] ?? null);
}

function baseOptions(over: Record<string, unknown> = {}) {
  return {
    to: recipient,
    subject: 'Hello',
    react,
    emailType: 'test' as const,
    metadata: { k: 'v' },
    ...over,
  };
}

describe('sendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEmailConfigured.mockReturnValue(true);
    mocks.send.mockResolvedValue({ data: { id: 'rid-1' }, error: null });
    mocks.insert.mockResolvedValue({ error: null });
    // `select` is the email daily cap count (#1265): none sent yet.
    const countChain: Record<string, unknown> = {};
    countChain.eq = () => countChain;
    countChain.gte = async () => ({ count: 0, error: null });
    mocks.from.mockImplementation(() => ({ insert: mocks.insert, select: () => countChain }));
    settings({});
    mocks.decideSend.mockResolvedValue({ result: { redirect: false }, envLabel: 'TEST' });
  });

  it('returns its own message and does not send when email_enabled is false', async () => {
    settings({ email_enabled: false });
    const result = await sendEmail(baseOptions());
    expect(result).toEqual({ success: false, error: 'Email notifications are disabled' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('fails open when email_enabled is null/absent', async () => {
    settings({});
    const result = await sendEmail(baseOptions());
    expect(result).toEqual({ success: true, resendId: 'rid-1' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('fails open when email_enabled is undefined from the service', async () => {
    mocks.getSettingValueAsService.mockResolvedValue(undefined);
    const result = await sendEmail(baseOptions());
    expect(result.success).toBe(true);
  });

  it('returns the shared not-configured message when Resend is unconfigured', async () => {
    mocks.isEmailConfigured.mockReturnValue(false);
    const result = await sendEmail(baseOptions());
    expect(result).toEqual({
      success: false,
      error: 'Email service not configured (missing RESEND_API_KEY)',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('with Debug Mode effective, sends to the override address instead of skipping', async () => {
    useRealResolver({ debugMode: true, debugExpiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    const result = await sendEmail(baseOptions());
    expect(result.success).toBe(true);
    expect(result.resendId).toBe('rid-1');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const arg = mocks.send.mock.calls[0][0];
    expect(arg.to).toBe(OVERRIDE_EMAIL);
    expect(arg.subject).toContain('a@test.example');

    // The log keeps both the intended and the actual recipient, and is a real send, not a 'debug' skip.
    const emailLog = mocks.insert.mock.calls[0][0];
    expect(emailLog).toMatchObject({ recipient_email: 'a@test.example', status: 'sent', resend_id: 'rid-1' });
    expect(emailLog.metadata.override).toMatchObject({ original: 'a@test.example', actual: OVERRIDE_EMAIL, reason: 'debug' });
  });

  it('sends to the real address once Debug Mode has expired', async () => {
    useRealResolver({ debugMode: true, debugExpiresAt: new Date(Date.now() - 1000).toISOString() });
    await sendEmail(baseOptions());
    expect(mocks.send.mock.calls[0][0].to).toEqual(['a@test.example']);
  });

  it('blocks rather than sending to the real address when Debug Mode is effective but the override email is blank', async () => {
    useRealResolver({ debugMode: true, debugExpiresAt: new Date(Date.now() + 3_600_000).toISOString(), email: '' });
    const result = await sendEmail(baseOptions());
    expect(result.success).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('no longer reads the legacy email_debug_mode setting', async () => {
    settings({ email_debug_mode: 'true' });
    const result = await sendEmail(baseOptions());
    expect(result).toEqual({ success: true, resendId: 'rid-1' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.getSettingValueAsService).not.toHaveBeenCalledWith('email_debug_mode');
  });

  it('sends with the exact Resend arguments (fallback from-name, array to)', async () => {
    await sendEmail(
      baseOptions({
        to: [recipient, { email: 'b@test.example', name: 'B' }],
        attachments: [{ filename: 'f.pdf', content: Buffer.from('x') }],
      })
    );
    expect(mocks.send).toHaveBeenCalledWith({
      from: 'Residio Estate <noreply@test.example>',
      to: ['a@test.example', 'b@test.example'],
      replyTo: 'reply@test.example',
      subject: 'Hello',
      react,
      attachments: [{ filename: 'f.pdf', content: Buffer.from('x') }],
    });
  });

  it('keeps react/attachments keys present even when undefined', async () => {
    await sendEmail(baseOptions({ react: undefined }));
    const arg = mocks.send.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual(
      ['attachments', 'from', 'react', 'replyTo', 'subject', 'to'].sort()
    );
  });

  it('uses a custom from-name from settings', async () => {
    settings({ email_from_name: 'Palm Estate' });
    await sendEmail(baseOptions());
    expect(mocks.send.mock.calls[0][0].from).toBe('Palm Estate <noreply@test.example>');
  });

  it('success returns resendId and logs a sent entry', async () => {
    const result = await sendEmail(baseOptions());
    expect(result).toEqual({ success: true, resendId: 'rid-1' });
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ status: 'sent', resend_id: 'rid-1' });
    expect(mocks.insert.mock.calls[1][0]).toMatchObject({ status: 'sent', external_id: 'rid-1' });
  });

  it('maps a Resend error to a failed result and logs it', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { message: 'bad domain' } });
    const result = await sendEmail(baseOptions());
    expect(result).toEqual({ success: false, error: 'bad domain' });
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      error_message: 'bad domain',
    });
  });

  it('maps a thrown Error to its message and logs it', async () => {
    mocks.send.mockRejectedValue(new Error('network down'));
    const result = await sendEmail(baseOptions());
    expect(result).toEqual({ success: false, error: 'network down' });
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      error_message: 'network down',
    });
  });

  it('maps a non-Error throw to the unknown-error message', async () => {
    mocks.send.mockRejectedValue('boom');
    const result = await sendEmail(baseOptions());
    expect(result).toEqual({ success: false, error: 'Unknown error sending email' });
  });

  it('lets a from-name settings read failure propagate (outside the try)', async () => {
    mocks.getSettingValueAsService.mockImplementation(async (key: string) => {
      if (key === 'email_from_name') throw new Error('settings down');
      return null;
    });
    await expect(sendEmail(baseOptions())).rejects.toThrow('settings down');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
