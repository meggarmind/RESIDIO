import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/lib/notifications/__tests__/helpers/fake-supabase';
import { formatNotice } from '@/lib/whatsapp/notice-format';

/** #1044: a resident send held back by a cap is queued for the next day instead of dropped, and goes out once. */
const NOW = new Date('2026-10-22T10:00:00.000Z');
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  evaluateSendPolicy: vi.fn(),
  sendWhatsAppMessage: vi.fn(),
  getSettingValueAsService: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/comms-override/resident-flag', () => ({ resolveResidentOverride: vi.fn(async () => ({ ok: true, residentOverride: undefined })) }));
vi.mock('@/lib/whatsapp/provider', () => ({ sendWhatsAppMessage: mocks.sendWhatsAppMessage }));
vi.mock('@/lib/whatsapp/send-policy', () => ({ evaluateSendPolicy: mocks.evaluateSendPolicy, createSendPolicyFacts: vi.fn(() => ({})) }));
vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: mocks.getSettingValueAsService,
  getSettingResultAsService: vi.fn(),
  getRawSettingsAsService: async () => ({ status: 'ok', values: new Map([['estate_name', 'Opera Estate']]) }),
}));
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate: vi.fn() }));
vi.mock('@/lib/whatsapp/config', () => ({ resolveWhatsAppConfig: vi.fn() }));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: vi.fn() }));
vi.mock('@/lib/email/transport', () => ({ getEmailTransportError: vi.fn(), sendViaResend: vi.fn() }));
vi.mock('@/lib/notifications/deduplication', () => ({ shouldQueue: vi.fn(), generateDeduplicationKey: vi.fn() }));

import { hasQueuedResidentSend, sendWhatsAppToResident } from '@/lib/whatsapp/resident-send';
import { sendAndRecordNotification, sendNotification } from '@/lib/notifications/send';
import { cancelQueueItem, processQueue, retryQueueItem } from '@/lib/notifications/queue';
import type { NotificationQueueItem } from '@/lib/notifications/types';

const defer = { outcome: 'defer', reason: 'daily_limit_reached', message: 'WhatsApp daily outbound limit reached' };
const allow = { outcome: 'allow', normalizedPhone: '+2348010000000', template: { name: '', languageCode: 'en_US', parameters: [] } };
let fake: ReturnType<typeof createFakeSupabase>;
const queued = () => fake.state.tables.notification_queue ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  fake = createFakeSupabase({ residents: [{ id: 'r1', phone_primary: '0801' }] });
  const client = fake.client as unknown as { from: (t: string) => unknown };
  // residents is read with .single(); the fake supports .maybeSingle only, so serve it directly.
  mocks.createAdminClient.mockReturnValue({
    ...client,
    from: (table: string) => table === 'residents'
      ? { select: () => ({ eq: () => ({ single: async () => ({ data: { phone_primary: '0801' }, error: null }) }) }) }
      : client.from(table),
    storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }) }) },
  });
  mocks.getSettingValueAsService.mockResolvedValue(null);
  mocks.sendWhatsAppMessage.mockResolvedValue({ success: true, messageId: 'm1' });
});

describe('deferred resident send (#1044)', () => {
  it('queues a capped message for the next Lagos midnight instead of dropping it', async () => {
    mocks.evaluateSendPolicy.mockResolvedValue(defer);
    const result = await sendWhatsAppToResident('r1', 'hello', { seed: 'approval:1:approved' });
    expect(result).toMatchObject({ sent: false, deferred: true });
    expect((result as { reason: string }).reason).toContain('will send automatically after midnight Lagos time');
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(queued()).toHaveLength(1);
    expect(queued()[0]).toMatchObject({
      // Queued with the notice header already on, so the later send reads the same as a direct one (#1351).
      channel: 'whatsapp', recipient_id: 'r1', recipient_phone: '0801', body: formatNotice('estate_notice', 'hello', 'Opera Estate'), status: 'pending',
      scheduled_for: '2026-10-22T23:00:00.000Z', deduplication_key: 'resident-send:approval:1:approved',
    });
  });

  it('queues a message once however many times the same seed is deferred', async () => {
    mocks.evaluateSendPolicy.mockResolvedValue(defer);
    await sendWhatsAppToResident('r1', 'hello', { seed: 's' });
    const again = await sendWhatsAppToResident('r1', 'hello', { seed: 's' });
    expect(again).toMatchObject({ sent: false, deferred: true });
    expect(queued()).toHaveLength(1);
  });

  it('does not queue a refused message (switch off, not opted in, outside the pilot)', async () => {
    mocks.evaluateSendPolicy.mockResolvedValue({ outcome: 'refuse', reason: 'no_opt_in', message: 'WhatsApp recipient has not opted in' });
    const result = await sendWhatsAppToResident('r1', 'hello', { seed: 's' });
    expect(result).toEqual({ sent: false, reason: 'WhatsApp recipient has not opted in' });
    expect(queued()).toHaveLength(0);
  });

  it('keeps the attachment as a stored file reference, and does not defer a send whose file is unknown', async () => {
    mocks.evaluateSendPolicy.mockResolvedValue(defer);
    await sendWhatsAppToResident('r1', 'cert', { seed: 'a', mediaUrls: ['https://expiring'], deferMedia: [{ bucket: 'documents', path: 'c.pdf' }] });
    expect(queued()[0].metadata).toEqual({ whatsapp_resident_send: { seed: 'a', media: [{ bucket: 'documents', path: 'c.pdf' }] } });
    const lost = await sendWhatsAppToResident('r1', 'cert', { seed: 'b', mediaUrls: ['https://expiring'] });
    expect(lost).toMatchObject({ sent: false });
    expect(lost).not.toHaveProperty('deferred');
    expect(queued()).toHaveLength(1);
  });

  describe('a held-back clearance copy (#1044)', () => {
    const copyRow = () => fake.state.tables.clearance_certificate_copies[0];
    async function dueCopy(maxAttempts = 3): Promise<NotificationQueueItem> {
      fake.state.tables.clearance_certificate_copies = [{ id: 'c1', document_id: 'd1', recipient_resident_id: 'r1', status: 'scheduled', error: 'held back' }];
      mocks.evaluateSendPolicy.mockResolvedValue(defer);
      await sendWhatsAppToResident('r1', 'cert', {
        seed: 'clearance-copy:d1:r1', mediaUrls: ['https://expiring'], deferMedia: [{ bucket: 'documents', path: 'c.pdf' }],
        clearanceCopy: { documentId: 'd1', recipientId: 'r1' },
      });
      const row = queued()[0];
      row.id = 'q1';
      return { ...row, attempts: 0, max_attempts: maxAttempts } as unknown as NotificationQueueItem;
    }

    it('carries the copy in the queued payload', async () => {
      const item = await dueCopy();
      expect(item.metadata).toMatchObject({ whatsapp_resident_send: { clearanceCopy: { documentId: 'd1', recipientId: 'r1' } } });
    });

    it('marks the copy sent once the queue delivers it', async () => {
      const item = await dueCopy();
      mocks.evaluateSendPolicy.mockResolvedValue(allow);
      await sendAndRecordNotification(item);
      expect(copyRow()).toMatchObject({ status: 'sent', error: null });
    });

    it('marks the copy failed with the error when the send finally fails', async () => {
      const item = await dueCopy(1);
      mocks.evaluateSendPolicy.mockResolvedValue(allow);
      mocks.sendWhatsAppMessage.mockResolvedValue({ success: false, error: 'provider down', retryable: true });
      await sendAndRecordNotification(item);
      expect(copyRow()).toMatchObject({ status: 'failed', error: 'provider down' });
    });

    it('keeps the copy scheduled while the queue will try again', async () => {
      const item = await dueCopy();
      await sendAndRecordNotification(item);
      expect(queued()[0]).toMatchObject({ status: 'pending' });
      expect(copyRow()).toMatchObject({ status: 'scheduled', error: 'held back' });
    });

    it('marks the copy failed when an admin cancels its queued send', async () => {
      await dueCopy();
      expect(await cancelQueueItem('q1', 'not needed')).toEqual({ success: true });
      expect(queued()[0]).toMatchObject({ status: 'cancelled' });
      expect(copyRow()).toMatchObject({ status: 'failed', error: 'not needed' });
    });

    it('marks the copy failed when the queue gives up on a row that keeps getting stuck', async () => {
      await dueCopy();
      Object.assign(queued()[0], { status: 'processing', last_attempt_at: null, max_attempts: 1 });
      await processQueue();
      expect(queued()[0]).toMatchObject({ status: 'failed' });
      expect(copyRow()).toMatchObject({ status: 'failed', error: 'Max attempts exceeded' });
      expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('marks the copy failed when the queue finds its attempts already used up', async () => {
      await dueCopy();
      Object.assign(queued()[0], { attempts: 3, max_attempts: 3, scheduled_for: '2026-10-22T00:00:00.000Z' });
      await processQueue();
      expect(queued()[0]).toMatchObject({ status: 'failed' });
      expect(copyRow()).toMatchObject({ status: 'failed', error: 'Max attempts exceeded' });
      expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('puts a failed copy back to scheduled when an admin retries its queue row, and marks it sent once delivered', async () => {
      await dueCopy();
      Object.assign(queued()[0], { attempts: 3, max_attempts: 3, scheduled_for: '2026-10-22T00:00:00.000Z' });
      await processQueue();
      expect(copyRow()).toMatchObject({ status: 'failed' });

      expect(await retryQueueItem('q1')).toEqual({ success: true });
      expect(queued()[0]).toMatchObject({ status: 'pending', attempts: 0 });
      expect(copyRow()).toMatchObject({ status: 'scheduled', error: null });

      mocks.evaluateSendPolicy.mockResolvedValue(allow);
      await processQueue();
      expect(mocks.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
      expect(copyRow()).toMatchObject({ status: 'sent', error: null });
    });

    it('leaves a copy alone when the queue row was not failed and so was not retried', async () => {
      await dueCopy();
      copyRow().status = 'failed';
      await retryQueueItem('q1');
      expect(queued()[0]).toMatchObject({ status: 'pending' });
      expect(copyRow()).toMatchObject({ status: 'failed' });
    });

    it('counts it as waiting for a retry check only while pending, not once sent', async () => {
      await dueCopy();
      const waiting = ['pending', 'processing'];
      expect(await hasQueuedResidentSend('clearance-copy:d1:r1', waiting)).toBe(true);
      queued()[0].status = 'sent';
      expect(await hasQueuedResidentSend('clearance-copy:d1:r1', waiting)).toBe(false);
      expect(await hasQueuedResidentSend('clearance-copy:d1:r1')).toBe(true);
    });
  });

  describe('when the queue sends it the next day', () => {
    async function dueItem(): Promise<NotificationQueueItem> {
      mocks.evaluateSendPolicy.mockResolvedValue(defer);
      await sendWhatsAppToResident('r1', 'cert', { seed: 'a', mediaUrls: ['https://expiring'], deferMedia: [{ bucket: 'documents', path: 'c.pdf' }], trackingId: 't1' });
      return { ...queued()[0], id: 'q1' } as unknown as NotificationQueueItem;
    }

    it('sends the stored body with a fresh URL, free-form, once the policy allows', async () => {
      const item = await dueItem();
      mocks.evaluateSendPolicy.mockResolvedValue(allow);
      const result = await sendNotification(item);
      expect(result).toMatchObject({ success: true, externalId: 'm1' });
      expect(mocks.evaluateSendPolicy).toHaveBeenLastCalledWith(expect.objectContaining({ recipientId: 'r1', freeForm: true }), expect.anything());
      expect(mocks.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
      expect(mocks.sendWhatsAppMessage).toHaveBeenCalledWith(
        { to: '0801', body: formatNotice('estate_notice', 'cert', 'Opera Estate'), idempotencySeed: 'a', mediaUrls: ['https://signed/c.pdf'] },
        undefined, undefined,
        { purpose: 'notification', residentId: 'r1', notificationQueueId: 'q1', inboundMessageId: 't1' }
      );
    });

    it('is not retried when the policy refuses it then (switched off, opted out, outside the pilot)', async () => {
      const item = await dueItem();
      mocks.evaluateSendPolicy.mockResolvedValue({ outcome: 'refuse', reason: 'no_opt_in', message: 'WhatsApp recipient has not opted in' });
      const result = await sendNotification(item);
      expect(result).toEqual({ success: false, error: 'WhatsApp recipient has not opted in' });
      expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('waits another day when the cap is still reached', async () => {
      const item = await dueItem();
      mocks.evaluateSendPolicy.mockResolvedValue(defer);
      expect(await sendNotification(item)).toMatchObject({ success: false, retryable: true, retryAt: '2026-10-22T23:00:00.000Z' });
      expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
    });
  });
});
