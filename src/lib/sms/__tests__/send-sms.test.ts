import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSms } from '@/lib/sms/send-sms';
import { getSettingValueAsService } from '@/actions/settings/get-settings';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('@/actions/settings/get-settings', () => ({
  getSettingValueAsService: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/sms/termii', () => ({
  termiiConfig: {
    apiKey: 'test-termii-key',
    senderId: 'Residio',
    baseUrl: 'https://api.ng.termii.test/api',
  },
  isSmsConfigured: vi.fn(() => true),
  formatPhoneForTermii: vi.fn((phone: string) => phone.replace(/^\+/, '')),
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

/**
 * Covers `SendSmsOptions.skipHistoryLog` (#401 QA fix): without it, `sendSms`
 * self-logs a `notification_history` row via `logSms`. The Chatmaid
 * WhatsApp -> SMS fallback in `src/lib/notifications/send.ts` sets the flag
 * so it can write the single history row itself (channel 'sms', linked to
 * the queue item) instead of getting a second, orphaned one from here.
 * Every other caller must keep logging exactly as before.
 */
describe('sendSms history logging (skipHistoryLog)', () => {
  let insertMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettingValueAsService).mockResolvedValue(true);
    insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as unknown as ReturnType<typeof createAdminClient>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs to notification_history by default on a successful send', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ code: 'ok', message_id: 'termii-1', balance: 100 }))
    );

    const result = await sendSms({
      to: { phone: '+2348000000000', residentId: 'resident-1' },
      message: 'Hello',
      smsType: 'notification',
    });

    expect(result).toEqual({ success: true, messageId: 'termii-1', balance: 100 });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ channel: 'sms', recipient_phone: '+2348000000000', status: 'sent' })
    );
  });

  it('does not log to notification_history on a successful send when skipHistoryLog is true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ code: 'ok', message_id: 'termii-2', balance: 100 }))
    );

    const result = await sendSms({
      to: { phone: '+2348000000000', residentId: 'resident-1' },
      message: 'Hello',
      smsType: 'notification',
      skipHistoryLog: true,
    });

    expect(result).toEqual({ success: true, messageId: 'termii-2', balance: 100 });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('logs to notification_history by default when the Termii API returns an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ code: 'error', message: 'Invalid number' }))
    );

    const result = await sendSms({
      to: { phone: '+2348000000000', residentId: 'resident-1' },
      message: 'Hello',
      smsType: 'notification',
    });

    expect(result).toEqual({ success: false, error: 'Invalid number' });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ channel: 'sms', status: 'failed', error_message: 'Invalid number' })
    );
  });

  it('does not log when the Termii API returns an error and skipHistoryLog is true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ code: 'error', message: 'Invalid number' }))
    );

    const result = await sendSms({
      to: { phone: '+2348000000000', residentId: 'resident-1' },
      message: 'Hello',
      smsType: 'notification',
      skipHistoryLog: true,
    });

    expect(result).toEqual({ success: false, error: 'Invalid number' });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('does not log when the fetch call itself throws and skipHistoryLog is true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await sendSms({
      to: { phone: '+2348000000000', residentId: 'resident-1' },
      message: 'Hello',
      smsType: 'notification',
      skipHistoryLog: true,
    });

    expect(result).toEqual({ success: false, error: 'network down' });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('logs by default when the fetch call itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await sendSms({
      to: { phone: '+2348000000000', residentId: 'resident-1' },
      message: 'Hello',
      smsType: 'notification',
    });

    expect(result).toEqual({ success: false, error: 'network down' });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
