/**
 * Issue #6 — outbound WhatsApp: retry, failure recording, and the
 * STOP -> send round trip. Real send.ts / queue.ts / identity.ts code runs
 * against ONE shared fake Supabase state, so a STOP written by the identity
 * handler is what the send path then reads.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type Row } from './helpers/fake-supabase';

vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: vi.fn(),
  getSettingResultAsService: vi.fn(),
}));
vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppTemplate: vi.fn(),
  isApprovedWhatsAppTemplateName: vi.fn((name: string) =>
    ['invoice_reminder', 'payment_received', 'announcement'].includes(name)
  ),
}));
vi.mock('@/lib/whatsapp/config', () => ({ resolveWhatsAppConfig: vi.fn() }));
vi.mock('@/lib/whatsapp/provider', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
// The resident-flag lookup (#716) is covered in comms-override/__tests__/resident-flag-wiring.test.ts.
vi.mock('@/lib/comms-override/resident-flag', () => ({
  resolveResidentOverride: vi.fn(async () => ({ ok: true, residentOverride: null })),
}));
vi.mock('@/lib/whatsapp/rollout', () => ({
  isWhatsAppRecipientAllowed: vi.fn().mockResolvedValue(true),
}));

import { getSettingValueAsService, getSettingResultAsService } from '@/lib/settings/service';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { createAdminClient } from '@/lib/supabase/server';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';
import { isWhatsAppOptedIn } from '@/lib/whatsapp/opt-in';
import { retryQueueItem } from '@/lib/notifications/queue';
import { sendAndRecordNotification, sendNotification } from '@/lib/notifications/send';
import {
  createSupabaseWhatsAppIdentityRepository,
  handleResidentMessage,
} from '@/lib/whatsapp/identity';
import type { NotificationQueueItem } from '@/lib/notifications/types';

const PHONE = '+2348000000000';

function queueRow(overrides: Row = {}): Row {
  return {
    id: 'queue-1',
    template_id: null,
    schedule_id: null,
    recipient_id: 'resident-1',
    recipient_email: null,
    recipient_phone: PHONE,
    channel: 'whatsapp',
    subject: null,
    body: 'Invoice reminder',
    html_body: null,
    variables: null,
    priority: 5,
    status: 'pending',
    deduplication_key: null,
    dedup_window_minutes: null,
    scheduled_for: new Date().toISOString(),
    attempts: 0,
    max_attempts: 3,
    last_attempt_at: null,
    sent_at: null,
    error_message: null,
    metadata: {
      whatsapp_template: {
        name: 'invoice_reminder',
        languageCode: 'en_US',
        parameters: ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'],
      },
    },
    created_at: new Date().toISOString(),
    created_by: null,
    ...overrides,
  };
}

function useFake(initial: Record<string, Row[]>) {
  const fake = createFakeSupabase(initial);
  vi.mocked(createAdminClient).mockReturnValue(
    fake.client as unknown as ReturnType<typeof createAdminClient>
  );
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSettingValueAsService).mockResolvedValue(true);
  vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'ok', value: true });
  vi.mocked(isWhatsAppRecipientAllowed).mockResolvedValue(true);
  vi.mocked(sendWhatsAppTemplate).mockResolvedValue({ success: true, messageId: 'wamid.1' });
});

describe('retryQueueItem for a failed WhatsApp item (#6)', () => {
  it('resets a failed WhatsApp item to pending and clears its error', async () => {
    const fake = useFake({
      notification_queue: [
        queueRow({ status: 'failed', attempts: 1, error_message: 'WhatsApp recipient has not opted in' }),
      ],
    });

    await expect(retryQueueItem('queue-1')).resolves.toEqual({ success: true });

    const row = fake.state.tables.notification_queue[0];
    expect(row.status).toBe('pending');
    expect(row.error_message).toBeNull();
    expect(row.channel).toBe('whatsapp');
  });

  it('only retries failed items: a sent item is left alone', async () => {
    const fake = useFake({
      notification_queue: [queueRow({ status: 'sent', error_message: null })],
    });

    await retryQueueItem('queue-1');

    expect(fake.state.tables.notification_queue[0].status).toBe('sent');
  });
});

describe('send-time WhatsApp refusals are failure rows, not silent successes (#6)', () => {
  it('records a failed history row and failed queue row when the recipient has not opted in', async () => {
    const fake = useFake({
      whatsapp_optins: [],
      notification_queue: [queueRow()],
      notification_history: [],
    });

    const result = await sendAndRecordNotification(queueRow() as unknown as NotificationQueueItem);

    expect(result).toMatchObject({ success: false, error: 'WhatsApp recipient has not opted in' });
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();

    const history = fake.state.tables.notification_history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      channel: 'whatsapp',
      status: 'failed',
      error_message: 'WhatsApp recipient has not opted in',
      sent_at: null,
    });
    expect(fake.state.tables.notification_queue[0]).toMatchObject({
      status: 'failed',
      error_message: 'WhatsApp recipient has not opted in',
      attempts: 1,
    });
  });

  it('records a failed row when the recipient is outside the rollout audience', async () => {
    vi.mocked(isWhatsAppRecipientAllowed).mockResolvedValue(false);
    const fake = useFake({
      whatsapp_optins: [{ resident_id: 'resident-1', phone_number: PHONE, opted_in: true }],
      notification_queue: [queueRow()],
      notification_history: [],
    });

    const result = await sendAndRecordNotification(queueRow() as unknown as NotificationQueueItem);

    expect(result.success).toBe(false);
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(fake.state.tables.notification_history[0]).toMatchObject({
      status: 'failed',
      error_message: 'WhatsApp recipient is outside the active rollout audience',
    });
    expect(fake.state.tables.notification_queue[0].status).toBe('failed');
  });

  it('records a SENT row for an opted-in recipient (control)', async () => {
    const fake = useFake({
      whatsapp_optins: [{ resident_id: 'resident-1', phone_number: PHONE, opted_in: true }],
      notification_queue: [queueRow()],
      notification_history: [],
    });

    const result = await sendAndRecordNotification(queueRow() as unknown as NotificationQueueItem);

    expect(result.success).toBe(true);
    expect(fake.state.tables.notification_history[0].status).toBe('sent');
    expect(fake.state.tables.notification_queue[0].status).toBe('sent');
  });
});

describe('STOP then send round trip (#6)', () => {
  it('a STOP reply flips opted_in and the send path then rejects that number', async () => {
    const fake = useFake({
      whatsapp_optins: [{ resident_id: 'resident-1', phone_number: PHONE, opted_in: true }],
      residents: [
        {
          id: 'resident-1',
          first_name: 'Ada',
          last_name: 'Obi',
          resident_code: 'R-1',
          phone_primary: PHONE,
          phone_secondary: null,
        },
      ],
      resident_houses: [],
      notification_history: [],
    });
    const item = queueRow() as unknown as NotificationQueueItem;

    // Before STOP: consent present, send goes through to the provider.
    await expect(sendNotification(item)).resolves.toMatchObject({ success: true });
    expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1);

    const reply = vi.fn().mockResolvedValue({ success: true });
    const result = await handleResidentMessage(
      { id: 'wamid.in', from: '2348000000000', timestamp: '1', type: 'text', text: 'STOP' },
      { repository: createSupabaseWhatsAppIdentityRepository(), send: reply }
    );

    expect(result.status).toBe('opted_out');
    expect(fake.state.tables.whatsapp_optins[0]).toMatchObject({
      resident_id: 'resident-1',
      opted_in: false,
    });

    // After STOP: the very same state makes the send path refuse.
    const after = await sendNotification(item);
    expect(after).toEqual({ success: false, error: 'WhatsApp recipient has not opted in' });
    expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1);
  });

  it('the enqueue-time helper and the send path read the same consent state', async () => {
    const fake = useFake({
      whatsapp_optins: [{ resident_id: 'resident-1', phone_number: PHONE, opted_in: true }],
      notification_history: [],
    });
    const item = queueRow() as unknown as NotificationQueueItem;

    await expect(isWhatsAppOptedIn('resident-1', PHONE)).resolves.toBe(true);
    await expect(sendNotification(item)).resolves.toMatchObject({ success: true });

    fake.state.tables.whatsapp_optins[0].opted_in = false;

    await expect(isWhatsAppOptedIn('resident-1', PHONE)).resolves.toBe(false);
    await expect(sendNotification(item)).resolves.toMatchObject({ success: false });
  });
});
