import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/lib/notifications/__tests__/helpers/fake-supabase';

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
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: mocks.getSettingValueAsService, getSettingResultAsService: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppTemplate: vi.fn() }));
vi.mock('@/lib/whatsapp/config', () => ({ resolveWhatsAppConfig: vi.fn() }));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: vi.fn() }));
vi.mock('@/lib/email/transport', () => ({ getEmailTransportError: vi.fn(), sendViaResend: vi.fn() }));
vi.mock('@/lib/notifications/deduplication', () => ({ shouldQueue: vi.fn(), generateDeduplicationKey: vi.fn() }));

import { sendWhatsAppToResident } from '@/lib/whatsapp/resident-send';
import { sendNotification } from '@/lib/notifications/send';
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
  it('queues a capped message for the next UTC midnight instead of dropping it', async () => {
    mocks.evaluateSendPolicy.mockResolvedValue(defer);
    const result = await sendWhatsAppToResident('r1', 'hello', { seed: 'approval:1:approved' });
    expect(result).toMatchObject({ sent: false, deferred: true });
    expect((result as { reason: string }).reason).toContain('will send automatically tomorrow');
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(queued()).toHaveLength(1);
    expect(queued()[0]).toMatchObject({
      channel: 'whatsapp', recipient_id: 'r1', recipient_phone: '0801', body: 'hello', status: 'pending',
      scheduled_for: '2026-10-23T00:00:00.000Z', deduplication_key: 'resident-send:approval:1:approved',
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
        { to: '0801', body: 'cert', idempotencySeed: 'a', mediaUrls: ['https://signed/c.pdf'] },
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
      expect(await sendNotification(item)).toMatchObject({ success: false, retryable: true, retryAt: '2026-10-23T00:00:00.000Z' });
      expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
    });
  });
});
