/**
 * #546 -- retry of transient notification failures with backoff.
 * Real send.ts / queue.ts / retry.ts run against one fake Supabase state; only
 * the Resend SDK, the WhatsApp provider and settings are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type Row } from './helpers/fake-supabase';

const mocks = vi.hoisted(() => ({
  resendSend: vi.fn(),
  isEmailConfigured: vi.fn(),
  markStatementEmailFailed: vi.fn(),
  sendStatementEmailFailedNotice: vi.fn(),
}));

vi.mock('@/lib/whatsapp/statement-delivery', () => ({
  markStatementEmailFailed: mocks.markStatementEmailFailed,
  sendStatementEmailFailedNotice: mocks.sendStatementEmailFailedNotice,
}));

vi.mock('@/lib/email/resend', () => ({
  resend: { emails: { send: mocks.resendSend } },
  emailConfig: { fromAddress: 'noreply@test.example', replyTo: 'reply@test.example' },
  isEmailConfigured: mocks.isEmailConfigured,
}));
// The communications override has its own tests; these specs cover retry classification.
vi.mock('@/lib/comms-override/gate', () => ({
  decideSend: async () => ({ result: { redirect: false }, envLabel: 'TEST' }),
  loadSnapshotFor: async () => ({ status: 'error', message: 'unused' }),
}));
vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: vi.fn(),
  getSettingResultAsService: vi.fn(),
}));
vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppTemplate: vi.fn(),
  isApprovedWhatsAppTemplateName: vi.fn((name: string) => name === 'invoice_reminder'),
}));
vi.mock('@/lib/whatsapp/config', () => ({ resolveWhatsAppConfig: vi.fn() }));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
// The resident-flag lookup (#716) is covered in comms-override/__tests__/resident-flag-wiring.test.ts.
vi.mock('@/lib/comms-override/resident-flag', () => ({
  resolveResidentOverride: vi.fn(async () => ({ ok: true, residentOverride: null })),
}));
vi.mock('@/lib/whatsapp/rollout', () => ({
  isWhatsAppRecipientAllowed: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/notifications/deduplication', () => ({
  shouldQueue: vi.fn(),
  generateDeduplicationKey: vi.fn(),
}));

import { getSettingValueAsService, getSettingResultAsService } from '@/lib/settings/service';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { createAdminClient } from '@/lib/supabase/server';
import { addToQueue, processQueue } from '@/lib/notifications/queue';
import { sendAndRecordNotification, sendNotification } from '@/lib/notifications/send';
import {
  DEFAULT_MAX_ATTEMPTS,
  nextLagosMidnight,
  resolveBurstWindowMinutes,
  retryDelayMs,
} from '@/lib/notifications/retry';
import type { NotificationQueueItem } from '@/lib/notifications/types';
import type { Json } from '@/types/database.generated';

const PHONE = '+2348000000000';
const NOW = new Date('2026-10-14T10:00:00.000Z');
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function queueRow(overrides: Row = {}): Row {
  return {
    id: 'queue-1',
    template_id: null,
    schedule_id: null,
    recipient_id: 'resident-1',
    recipient_email: 'a@test.example',
    recipient_phone: null,
    channel: 'email',
    subject: 'Subject',
    body: 'Body',
    html_body: null,
    variables: null,
    priority: 5,
    status: 'pending',
    deduplication_key: null,
    dedup_window_minutes: null,
    scheduled_for: new Date(NOW.getTime() - MIN).toISOString(),
    attempts: 0,
    max_attempts: 5,
    last_attempt_at: null,
    sent_at: null,
    error_message: null,
    metadata: null,
    created_at: NOW.toISOString(),
    created_by: null,
    ...overrides,
  };
}

function whatsappRow(overrides: Row = {}): Row {
  return queueRow({
    channel: 'whatsapp',
    recipient_email: null,
    recipient_phone: PHONE,
    metadata: {
      whatsapp_template: { name: 'invoice_reminder', languageCode: 'en_US', parameters: ['Ada'] },
    },
    ...overrides,
  });
}

function useFake(initial: Record<string, Row[]>) {
  const fake = createFakeSupabase(initial);
  vi.mocked(createAdminClient).mockReturnValue(
    fake.client as unknown as ReturnType<typeof createAdminClient>
  );
  return fake;
}

const asItem = (row: Row) => row as unknown as NotificationQueueItem;

let settingValues: Record<string, Json>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  settingValues = { email_enabled: true, whatsapp_enabled: true };
  vi.mocked(getSettingValueAsService).mockImplementation(async (key: string) => settingValues[key] ?? null);
  vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'ok', value: true });
  mocks.isEmailConfigured.mockReturnValue(true);
  useFake({}); // the email daily cap (#1265) counts notification_history
  mocks.resendSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  vi.mocked(sendWhatsAppTemplate).mockResolvedValue({ success: true, messageId: 'wamid.1' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('retry helpers', () => {
  it('backs off 15m, 1h, 6h, 24h after the 1st..4th failed attempt', () => {
    expect(retryDelayMs(1)).toBe(15 * MIN);
    expect(retryDelayMs(2)).toBe(1 * HOUR);
    expect(retryDelayMs(3)).toBe(6 * HOUR);
    expect(retryDelayMs(4)).toBe(24 * HOUR);
  });

  it('reuses the longest delay beyond the table and clamps below 1', () => {
    expect(retryDelayMs(9)).toBe(24 * HOUR);
    expect(retryDelayMs(0)).toBe(15 * MIN);
  });

  it('nextLagosMidnight is the next 00:00 Lagos (23:00 UTC), even exactly at midnight', () => {
    expect(nextLagosMidnight(new Date('2026-10-14T22:30:00.000Z')).toISOString()).toBe('2026-10-14T23:00:00.000Z');
    expect(nextLagosMidnight(new Date('2026-10-14T23:00:00.000Z')).toISOString()).toBe('2026-10-15T23:00:00.000Z');
    expect(nextLagosMidnight(new Date('2026-10-31T23:30:00.000Z')).toISOString()).toBe('2026-11-01T23:00:00.000Z');
  });

  it('resolveBurstWindowMinutes mirrors the policy default of 10', () => {
    expect(resolveBurstWindowMinutes(3)).toBe(3);
    expect(resolveBurstWindowMinutes(0)).toBe(10);
    expect(resolveBurstWindowMinutes('5')).toBe(10);
    expect(resolveBurstWindowMinutes(undefined)).toBe(10);
  });
});

describe('failure classification', () => {
  const emailItem = asItem(queueRow());

  it.each([
    ['5xx', { message: 'boom', statusCode: 503, name: 'application_error' }],
    ['429', { message: 'slow down', statusCode: 429, name: 'rate_limit_exceeded' }],
    ['408', { message: 'timeout', statusCode: 408, name: 'validation_error' }],
    ['named internal_server_error without status', { message: 'x', statusCode: null, name: 'internal_server_error' }],
  ])('email: Resend %s is retryable', async (_label, error) => {
    mocks.resendSend.mockResolvedValue({ data: null, error });
    await expect(sendNotification(emailItem)).resolves.toMatchObject({ success: false, retryable: true });
  });

  it.each([
    ['5xx with an unlisted name', { message: 'x', statusCode: 503, name: 'service_unavailable' }],
    ['429 with a non-retryable name', { message: 'x', statusCode: 429, name: 'daily_quota_exceeded' }],
    ['500 with a validation name', { message: 'x', statusCode: 500, name: 'validation_error' }],
  ])('email: Resend %s is retryable by status alone', async (_label, error) => {
    mocks.resendSend.mockResolvedValue({ data: null, error });
    await expect(sendNotification(emailItem)).resolves.toMatchObject({ success: false, retryable: true });
  });

  it('email: a thrown network error is retryable', async () => {
    mocks.resendSend.mockRejectedValue(new Error('fetch failed'));
    await expect(sendNotification(emailItem)).resolves.toMatchObject({ success: false, retryable: true });
  });

  it.each([
    ['validation', { message: 'bad', statusCode: 422, name: 'validation_error' }],
    ['invalid api key', { message: 'bad', statusCode: 401, name: 'invalid_api_key' }],
  ])('email: Resend %s is not retryable', async (_label, error) => {
    mocks.resendSend.mockResolvedValue({ data: null, error });
    await expect(sendNotification(emailItem)).resolves.toEqual({ success: false, error: 'bad' });
  });

  it('email: disabled, unconfigured and missing recipient are not retryable', async () => {
    settingValues.email_enabled = false;
    expect((await sendNotification(emailItem)).retryable).toBeUndefined();
    settingValues.email_enabled = true;
    mocks.isEmailConfigured.mockReturnValue(false);
    expect((await sendNotification(emailItem)).retryable).toBeUndefined();
    mocks.isEmailConfigured.mockReturnValue(true);
    const none = await sendNotification(asItem(queueRow({ recipient_email: null })));
    expect(none).toEqual({ success: false, error: 'No recipient email address provided' });
  });

  it('an unsupported channel is not retryable', async () => {
    const result = await sendNotification(asItem(queueRow({ channel: 'sms' })));
    expect(result.success).toBe(false);
    expect(result.retryable).toBeUndefined();
  });

  it('whatsapp: a policy refuse (not opted in) is never retryable', async () => {
    useFake({ whatsapp_optins: [] });
    const result = await sendNotification(asItem(whatsappRow()));
    expect(result).toEqual({ success: false, error: 'WhatsApp recipient has not opted in' });
  });

  it('whatsapp: kill switch refuse is not retryable', async () => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'ok', value: false });
    const result = await sendNotification(asItem(whatsappRow()));
    expect(result.success).toBe(false);
    expect(result.retryable).toBeUndefined();
  });

  describe('with consent in place', () => {
    beforeEach(() => {
      useFake({
        whatsapp_optins: [{ resident_id: 'resident-1', phone_number: PHONE, opted_in: true }],
        notification_history: [],
      });
    });

    it('provider transport failure with no flag defaults to retryable', async () => {
      vi.mocked(sendWhatsAppTemplate).mockResolvedValue({ success: false, error: 'provider down' });
      await expect(sendNotification(asItem(whatsappRow()))).resolves.toMatchObject({
        success: false,
        retryable: true,
      });
    });

    it('provider failure flagged retryable: false is not retryable', async () => {
      vi.mocked(sendWhatsAppTemplate).mockResolvedValue({ success: false, error: 'HTTP 400', retryable: false });
      const result = await sendNotification(asItem(whatsappRow()));
      expect(result.success).toBe(false);
      expect(result.retryable).toBeUndefined();
    });

    it('a successful send carries no retry fields', async () => {
      const result = await sendNotification(asItem(whatsappRow()));
      expect(result.success).toBe(true);
      expect(result.retryable).toBeUndefined();
      expect(result.retryAt).toBeUndefined();
    });
  });

  describe('Send Policy defer', () => {
    beforeEach(() => {
      useFake({
        whatsapp_optins: [{ resident_id: 'resident-1', phone_number: PHONE, opted_in: true }],
        notification_history: [
          { channel: 'whatsapp', status: 'sent', queue_id: 'queue-0', sent_at: new Date(NOW.getTime() - MIN).toISOString() },
        ],
      });
    });

    it('daily cap: retryable, retryAt is the next Lagos midnight', async () => {
      settingValues.whatsapp_outbound_daily_cap = 1;
      const result = await sendNotification(asItem(whatsappRow()));
      expect(result).toMatchObject({
        success: false,
        error: 'WhatsApp daily outbound limit reached',
        retryable: true,
        retryAt: '2026-10-14T23:00:00.000Z',
      });
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    });

    it('burst cap: retryable, retryAt is now plus the burst window', async () => {
      settingValues.whatsapp_outbound_burst_cap = 1;
      settingValues.whatsapp_outbound_burst_window_minutes = 7;
      const result = await sendNotification(asItem(whatsappRow()));
      expect(result).toMatchObject({
        success: false,
        error: 'WhatsApp outbound burst limit reached',
        retryable: true,
        retryAt: new Date(NOW.getTime() + 7 * MIN).toISOString(),
      });
    });

    it('burst cap with no configured window uses 10 minutes', async () => {
      settingValues.whatsapp_outbound_burst_cap = 1;
      const result = await sendNotification(asItem(whatsappRow()));
      expect(result.retryAt).toBe(new Date(NOW.getTime() + 10 * MIN).toISOString());
    });
  });
});

describe('sendAndRecordNotification requeue', () => {
  const transient = { message: 'unavailable', statusCode: 503, name: 'application_error' };

  it('requeues a retryable failure with attempts left, with backoff and a failed history row', async () => {
    mocks.resendSend.mockResolvedValue({ data: null, error: transient });
    const fake = useFake({ notification_queue: [queueRow()], notification_history: [] });

    const result = await sendAndRecordNotification(asItem(queueRow()));

    expect(result.success).toBe(false);
    const row = fake.state.tables.notification_queue[0];
    expect(row).toMatchObject({
      status: 'pending',
      attempts: 1,
      error_message: 'unavailable',
      sent_at: null,
      scheduled_for: new Date(NOW.getTime() + 15 * MIN).toISOString(),
      last_attempt_at: NOW.toISOString(),
    });
    const history = fake.state.tables.notification_history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ status: 'failed', error_message: 'unavailable' });
    expect(history[0].metadata).toMatchObject({
      queue_attempts: 1,
      will_retry: true,
      retry_at: new Date(NOW.getTime() + 15 * MIN).toISOString(),
    });
  });

  it('uses the backoff for the attempt number: 3rd failure waits 6 hours', async () => {
    mocks.resendSend.mockResolvedValue({ data: null, error: transient });
    const fake = useFake({ notification_queue: [queueRow({ attempts: 2 })], notification_history: [] });

    await sendAndRecordNotification(asItem(queueRow({ attempts: 2 })));

    expect(fake.state.tables.notification_queue[0]).toMatchObject({
      status: 'pending',
      attempts: 3,
      scheduled_for: new Date(NOW.getTime() + 6 * HOUR).toISOString(),
    });
  });

  it('still requeues on the last slot before the final attempt (attempt 4 of 5)', async () => {
    mocks.resendSend.mockResolvedValue({ data: null, error: transient });
    const fake = useFake({ notification_queue: [queueRow({ attempts: 3 })], notification_history: [] });

    await sendAndRecordNotification(asItem(queueRow({ attempts: 3 })));

    expect(fake.state.tables.notification_queue[0]).toMatchObject({
      status: 'pending',
      attempts: 4,
      scheduled_for: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
    });
  });

  it('marks failed on the final attempt', async () => {
    mocks.resendSend.mockResolvedValue({ data: null, error: transient });
    const fake = useFake({ notification_queue: [queueRow({ attempts: 4 })], notification_history: [] });

    await sendAndRecordNotification(asItem(queueRow({ attempts: 4 })));

    expect(fake.state.tables.notification_queue[0]).toMatchObject({ status: 'failed', attempts: 5 });
    const meta = fake.state.tables.notification_history[0].metadata as Record<string, unknown>;
    expect(meta.will_retry).toBeUndefined();
  });

  it('marks a non-retryable failure failed on the first attempt', async () => {
    mocks.resendSend.mockResolvedValue({
      data: null,
      error: { message: 'bad address', statusCode: 422, name: 'validation_error' },
    });
    const fake = useFake({ notification_queue: [queueRow()], notification_history: [] });

    await sendAndRecordNotification(asItem(queueRow()));

    expect(fake.state.tables.notification_queue[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(fake.state.tables.notification_queue[0].scheduled_for).toBe(queueRow().scheduled_for);
  });

  it('never requeues a max_attempts: 1 row, even when retryable', async () => {
    mocks.resendSend.mockResolvedValue({ data: null, error: transient });
    const fake = useFake({ notification_queue: [queueRow({ max_attempts: 1 })], notification_history: [] });

    await sendAndRecordNotification(asItem(queueRow({ max_attempts: 1 })));

    expect(fake.state.tables.notification_queue[0]).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('leaves a success unchanged', async () => {
    const fake = useFake({ notification_queue: [queueRow()], notification_history: [] });

    const result = await sendAndRecordNotification(asItem(queueRow()));

    expect(result.success).toBe(true);
    expect(fake.state.tables.notification_queue[0]).toMatchObject({ status: 'sent', attempts: 1 });
    expect(fake.state.tables.notification_history[0].status).toBe('sent');
  });

  it('requeues a deferred WhatsApp send at the policy retryAt, not the backoff', async () => {
    settingValues.whatsapp_outbound_daily_cap = 1;
    const fake = useFake({
      whatsapp_optins: [{ resident_id: 'resident-1', phone_number: PHONE, opted_in: true }],
      notification_queue: [whatsappRow()],
      notification_history: [
        { channel: 'whatsapp', status: 'sent', queue_id: 'queue-0', sent_at: new Date(NOW.getTime() - MIN).toISOString() },
      ],
    });

    await sendAndRecordNotification(asItem(whatsappRow()));

    expect(fake.state.tables.notification_queue[0]).toMatchObject({
      status: 'pending',
      scheduled_for: '2026-10-14T23:00:00.000Z',
    });
  });

  it('keeps a candidate queued, not failed, while a retry is pending', async () => {
    mocks.resendSend.mockResolvedValue({ data: null, error: transient });
    const meta = { candidateId: 'cand-1' };
    const fake = useFake({
      notification_queue: [queueRow({ metadata: meta })],
      notification_history: [],
      invoice_generation_candidates: [{ id: 'cand-1', email_status: 'queued' }],
    });

    await sendAndRecordNotification(asItem(queueRow({ metadata: meta })));
    expect(fake.state.tables.invoice_generation_candidates[0].email_status).toBe('queued');

    await sendAndRecordNotification(asItem(queueRow({ metadata: meta, attempts: 4 })));
    expect(fake.state.tables.invoice_generation_candidates[0].email_status).toBe('failed');
  });

  it('passes an idempotency key of <queue id>:<attempt> to Resend', async () => {
    useFake({ notification_queue: [queueRow({ attempts: 2 })], notification_history: [] });

    await sendAndRecordNotification(asItem(queueRow({ attempts: 2 })));

    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    expect(mocks.resendSend.mock.calls[0][1]).toEqual({ idempotencyKey: 'queue-1:3' });
  });
});

describe('processQueue picks requeued items up only when due', () => {
  it('skips a requeued item before scheduled_for and sends it after', async () => {
    mocks.resendSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'unavailable', statusCode: 503, name: 'application_error' },
    });
    const fake = useFake({ notification_queue: [queueRow()], notification_history: [] });

    const first = await processQueue();
    expect(first).toMatchObject({ processed: 1, sent: 0, failed: 1 });
    expect(fake.state.tables.notification_queue[0]).toMatchObject({ status: 'pending', attempts: 1 });

    vi.setSystemTime(new Date(NOW.getTime() + 14 * MIN));
    const tooEarly = await processQueue();
    expect(tooEarly.processed).toBe(0);
    expect(mocks.resendSend).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(NOW.getTime() + 16 * MIN));
    const due = await processQueue();
    expect(due).toMatchObject({ processed: 1, sent: 1, failed: 0 });
    expect(mocks.resendSend).toHaveBeenCalledTimes(2);
    expect(mocks.resendSend.mock.calls[1][1]).toEqual({ idempotencyKey: 'queue-1:2' });
    expect(fake.state.tables.notification_queue[0]).toMatchObject({ status: 'sent', attempts: 2 });
    expect(fake.state.tables.notification_history).toHaveLength(2);
  });
});

describe('processQueue exhausted-row guard', () => {
  it('fails a pending row with attempts >= max_attempts without sending it', async () => {
    const fake = useFake({
      notification_queue: [queueRow({ attempts: 5, max_attempts: 5 })],
      notification_history: [],
    });

    const result = await processQueue();

    expect(result).toMatchObject({ processed: 1, sent: 0, failed: 1 });
    expect(result.errors).toEqual([{ queueId: 'queue-1', error: 'Max attempts exceeded' }]);
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(fake.state.tables.notification_queue[0]).toMatchObject({
      status: 'failed',
      error_message: 'Max attempts exceeded',
    });
  });

  it('marks an exhausted WhatsApp statement email failed and tells the resident (#1252)', async () => {
    mocks.markStatementEmailFailed.mockResolvedValue(true);
    useFake({
      notification_queue: [queueRow({ attempts: 5, max_attempts: 5, metadata: { whatsapp_statement_request_id: 'request-1' } })],
      notification_history: [],
    });

    await processQueue();

    expect(mocks.markStatementEmailFailed).toHaveBeenCalledWith('request-1');
    expect(mocks.sendStatementEmailFailedNotice).toHaveBeenCalledWith('request-1');
  });

  it('sends no notice when the statement request had already left queued (#1252)', async () => {
    mocks.markStatementEmailFailed.mockResolvedValue(false);
    useFake({
      notification_queue: [queueRow({ attempts: 5, max_attempts: 5, metadata: { whatsapp_statement_request_id: 'request-1' } })],
      notification_history: [],
    });

    await processQueue();

    expect(mocks.markStatementEmailFailed).toHaveBeenCalledWith('request-1');
    expect(mocks.sendStatementEmailFailedNotice).not.toHaveBeenCalled();
  });

  it('leaves other exhausted rows alone and survives a settle error (#1252)', async () => {
    useFake({ notification_queue: [queueRow({ attempts: 5, max_attempts: 5 })], notification_history: [] });
    await processQueue();
    expect(mocks.markStatementEmailFailed).not.toHaveBeenCalled();

    mocks.markStatementEmailFailed.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useFake({
      notification_queue: [queueRow({ attempts: 5, max_attempts: 5, metadata: { whatsapp_statement_request_id: 'request-1' } })],
      notification_history: [],
    });
    await expect(processQueue()).resolves.toMatchObject({ failed: 1 });
  });
});

describe('addToQueue max_attempts', () => {
  const base = {
    recipient_id: 'resident-1',
    recipient_email: 'a@test.example',
    channel: 'email' as const,
    body: 'Body',
  };

  it('defaults to DEFAULT_MAX_ATTEMPTS (5)', async () => {
    const fake = useFake({ notification_queue: [] });
    expect(DEFAULT_MAX_ATTEMPTS).toBe(5);

    await addToQueue(base);

    expect(fake.state.tables.notification_queue[0].max_attempts).toBe(5);
  });

  it('respects an explicit value', async () => {
    const fake = useFake({ notification_queue: [] });
    await addToQueue({ ...base, max_attempts: 1 });
    expect(fake.state.tables.notification_queue[0].max_attempts).toBe(1);
  });
});
