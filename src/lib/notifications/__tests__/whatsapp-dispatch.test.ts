import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMPLEMENTED_CHANNELS } from '@/lib/notifications/types';
import { PRIORITY } from '@/lib/notifications/queue';
import { sendNotification, sendAndRecordNotification } from '@/lib/notifications/send';
import { getSettingValueAsService, getSettingResultAsService } from '@/actions/settings/get-settings';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { resolveWhatsAppConfig } from '@/lib/whatsapp/config';
import { createAdminClient } from '@/lib/supabase/server';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';
import { sendSms } from '@/lib/sms/send-sms';

vi.mock('@/actions/settings/get-settings', () => ({
  getSettingValueAsService: vi.fn(),
  getSettingResultAsService: vi.fn(),
}));

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppTemplate: vi.fn(),
  isApprovedWhatsAppTemplateName: vi.fn((name: string) =>
    ['invoice_reminder', 'payment_received', 'announcement'].includes(name)
  ),
}));

vi.mock('@/lib/whatsapp/config', () => ({
  resolveWhatsAppConfig: vi.fn(),
}));

vi.mock('@/lib/sms/send-sms', () => ({
  sendSms: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/whatsapp/rollout', () => ({
  isWhatsAppRecipientAllowed: vi.fn().mockResolvedValue(true),
}));

const metaConfigResult = {
  status: 'ok' as const,
  config: {
    provider: 'meta' as const,
    accessToken: 'token',
    phoneNumberId: 'phone-id',
    verifyToken: 'verify',
    appSecret: 'secret',
    apiVersion: 'v23.0',
    graphBaseUrl: 'https://graph.example.test',
  },
};

const chatmaidConfigResult = {
  status: 'ok' as const,
  config: {
    provider: 'chatmaid' as const,
    apiKey: 'sk_test_key',
    webhookSecret: 'whsec',
    fromNumber: '+2348037000101',
    baseUrl: 'https://developers-api.chatmaid.test',
  },
};

function buildQueueItem(overrides: Partial<Parameters<typeof sendNotification>[0]> = {}) {
  return {
    id: 'queue-fallback',
    template_id: null,
    schedule_id: null,
    recipient_id: 'resident-1',
    recipient_email: null,
    recipient_phone: '2348000000000',
    channel: 'whatsapp' as const,
    subject: null,
    body: 'Announcement: estate-wide water outage today.',
    html_body: null,
    variables: null,
    priority: PRIORITY.URGENT,
    status: 'pending' as const,
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
        name: 'announcement',
        languageCode: 'en_US',
        parameters: ['Water outage', 'Estate-wide water outage today.'],
      },
    },
    created_at: new Date().toISOString(),
    created_by: null,
    ...overrides,
  };
}

describe('WhatsApp notification dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettingValueAsService).mockResolvedValue(true);
    // whatsapp_enabled is read via getSettingResultAsService (#134, fail
    // closed) — default it 'ok'/true so this gate doesn't block sends this
    // file isn't testing.
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'ok', value: true });
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
         select: vi.fn().mockReturnThis(),
         eq: vi.fn().mockReturnThis(),
         gte: vi.fn().mockReturnThis(),
         maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'optin-1' }, error: null }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>);
  });

  it('advertises WhatsApp but not dormant SMS as implemented', () => {
    expect(IMPLEMENTED_CHANNELS).toEqual(['email', 'whatsapp']);
  });

  it('sends a WhatsApp template through the provider seam', async () => {
    vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
      success: true,
      messageId: 'wamid.outbound-1',
    });

    const result = await sendNotification({
      id: 'queue-1',
      template_id: null,
      schedule_id: null,
      recipient_id: 'resident-1',
      recipient_email: null,
      recipient_phone: '2348000000000',
      channel: 'whatsapp',
      subject: null,
      body: 'Reminder',
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
    });

    expect(result).toEqual({ success: true, externalId: 'wamid.outbound-1', error: undefined });
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith({
      to: '+2348000000000',
      templateName: 'invoice_reminder',
      languageCode: 'en_US',
      parameters: ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'],
    });
  });

  it('rejects WhatsApp sends when the configured daily cap is reached', async () => {
    vi.mocked(getSettingValueAsService).mockImplementation(async (key) => {
      if (key === 'whatsapp_outbound_daily_cap') return 1;
      return true;
    });
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'notification_history') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ count: 1, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'optin-1' }, error: null }),
        };
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    await expect(sendNotification({
      id: 'queue-cap',
      template_id: null,
      schedule_id: null,
      recipient_id: 'resident-1',
      recipient_email: null,
      recipient_phone: '2348000000000',
      channel: 'whatsapp',
      subject: null,
      body: 'Reminder',
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
    })).resolves.toEqual({ success: false, error: 'WhatsApp daily outbound limit reached' });
  });

  it('rejects WhatsApp sends when the rolling burst cap is reached', async () => {
    vi.mocked(getSettingValueAsService).mockImplementation(async (key) => {
      if (key === 'whatsapp_outbound_burst_cap') return 1;
      if (key === 'whatsapp_outbound_burst_window_minutes') return 10;
      return key === 'whatsapp_outbound_daily_cap' ? 100 : true;
    });
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => table === 'notification_history'
        ? { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockResolvedValue({ count: 1, error: null }) }
        : { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'optin-1' }, error: null }) }),
    } as unknown as ReturnType<typeof createAdminClient>);

    await expect(sendNotification({
      id: 'queue-burst-cap', template_id: null, schedule_id: null, recipient_id: 'resident-1', recipient_email: null,
      recipient_phone: '2348000000000', channel: 'whatsapp', subject: null, body: 'Reminder', html_body: null,
      variables: null, priority: 5, status: 'pending', deduplication_key: null, dedup_window_minutes: null,
      scheduled_for: new Date().toISOString(), attempts: 0, max_attempts: 3, last_attempt_at: null, sent_at: null,
      error_message: null, metadata: { whatsapp_template: { name: 'invoice_reminder', languageCode: 'en_US', parameters: ['Ada'] } },
      created_at: new Date().toISOString(), created_by: null,
    })).resolves.toEqual({ success: false, error: 'WhatsApp outbound burst limit reached' });
  });

  it('pauses safely before checking consent or invoking the provider', async () => {
    vi.mocked(isWhatsAppRecipientAllowed).mockResolvedValueOnce(false);

    await expect(sendNotification({
      id: 'queue-paused',
      template_id: null,
      schedule_id: null,
      recipient_id: 'resident-1',
      recipient_email: null,
      recipient_phone: '2348000000000',
      channel: 'whatsapp',
      subject: null,
      body: 'Reminder',
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
          name: 'payment_received',
          languageCode: 'en_US',
          parameters: ['Ada', 'NGN 5,000', '01/09', 'REF'],
        },
      },
      created_at: new Date().toISOString(),
      created_by: null,
    })).resolves.toEqual({
      success: false,
      error: 'WhatsApp recipient is outside the active rollout audience',
    });
  });

  describe('SMS fallback for URGENT sends on a failed Chatmaid provider (#401)', () => {
    it('falls back to SMS when an URGENT WhatsApp send fails and the active provider is Chatmaid', async () => {
      vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
        success: false,
        error: 'Chatmaid bridge is disconnected',
      });
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(chatmaidConfigResult);
      vi.mocked(sendSms).mockResolvedValue({ success: true, messageId: 'termii-1' });

      const result = await sendNotification(buildQueueItem());

      expect(sendSms).toHaveBeenCalledWith(
        expect.objectContaining({
          to: { phone: '2348000000000', residentId: 'resident-1' },
          message: 'Announcement: estate-wide water outage today.',
        })
      );
      expect(result).toEqual({
        success: true,
        externalId: 'termii-1',
        metadata: {
          deliveredVia: 'sms_fallback',
          whatsappError: 'Chatmaid bridge is disconnected',
        },
      });
    });

    it('does not fall back to SMS for a non-URGENT send even when the provider is Chatmaid', async () => {
      vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
        success: false,
        error: 'Chatmaid bridge is disconnected',
      });
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(chatmaidConfigResult);
      vi.mocked(sendSms).mockResolvedValue({ success: true, messageId: 'termii-should-not-be-used' });

      const result = await sendNotification(buildQueueItem({ priority: PRIORITY.NORMAL }));

      expect(sendSms).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        externalId: undefined,
        error: 'Chatmaid bridge is disconnected',
      });
    });

    it('does not fall back to SMS for an URGENT send when the active provider is Meta', async () => {
      vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
        success: false,
        error: 'WhatsApp provider request failed (HTTP 401)',
      });
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(metaConfigResult);
      vi.mocked(sendSms).mockResolvedValue({ success: true, messageId: 'termii-should-not-be-used' });

      const result = await sendNotification(buildQueueItem());

      expect(sendSms).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        externalId: undefined,
        error: 'WhatsApp provider request failed (HTTP 401)',
      });
    });

    it('does not fall back to SMS when the Chatmaid WhatsApp send already succeeded', async () => {
      vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
        success: true,
        messageId: 'msg_chatmaid_1',
      });
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(chatmaidConfigResult);
      vi.mocked(sendSms).mockResolvedValue({ success: true, messageId: 'termii-should-not-be-used' });

      const result = await sendNotification(buildQueueItem());

      expect(sendSms).not.toHaveBeenCalled();
      expect(resolveWhatsAppConfig).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, externalId: 'msg_chatmaid_1', error: undefined });
    });

    it('reports both failures when the SMS fallback itself also fails', async () => {
      vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
        success: false,
        error: 'Chatmaid bridge is disconnected',
      });
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(chatmaidConfigResult);
      vi.mocked(sendSms).mockResolvedValue({ success: false, error: 'Termii balance exhausted' });

      const result = await sendNotification(buildQueueItem());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Chatmaid bridge is disconnected');
      expect(result.error).toContain('Termii balance exhausted');
    });

    it('calls sendSms with skipHistoryLog so it does not write its own history row', async () => {
      vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
        success: false,
        error: 'Chatmaid bridge is disconnected',
      });
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(chatmaidConfigResult);
      vi.mocked(sendSms).mockResolvedValue({ success: true, messageId: 'termii-1' });

      await sendNotification(buildQueueItem());

      expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({ skipHistoryLog: true }));
    });

    it('does not send SMS when the recipient has not opted in, even for an URGENT Chatmaid item', async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) =>
          table === 'notification_history'
            ? {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              }
            : {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }
        ),
      } as unknown as ReturnType<typeof createAdminClient>);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(chatmaidConfigResult);

      const result = await sendNotification(buildQueueItem());

      // The opt-in gate runs before the WhatsApp send is even attempted, so
      // the fallback path (which only runs after a failed send) must never
      // be reached -- this pins that ordering rather than assuming it.
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
      expect(sendSms).not.toHaveBeenCalled();
      expect(result).toEqual({ success: false, error: 'WhatsApp recipient has not opted in' });
    });

    it('does not send SMS when the burst cap is reached, even for an URGENT Chatmaid item', async () => {
      vi.mocked(getSettingValueAsService).mockImplementation(async (key) => {
        if (key === 'whatsapp_outbound_burst_cap') return 1;
        if (key === 'whatsapp_outbound_burst_window_minutes') return 10;
        return key === 'whatsapp_outbound_daily_cap' ? 100 : true;
      });
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) =>
          table === 'notification_history'
            ? {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                gte: vi.fn().mockResolvedValue({ count: 1, error: null }),
              }
            : {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'optin-1' }, error: null }),
              }
        ),
      } as unknown as ReturnType<typeof createAdminClient>);
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(chatmaidConfigResult);

      const result = await sendNotification(buildQueueItem());

      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
      expect(sendSms).not.toHaveBeenCalled();
      expect(result).toEqual({ success: false, error: 'WhatsApp outbound burst limit reached' });
    });
  });

  describe('recording SMS-fallback history rows (#401 QA fix)', () => {
    function buildSupabaseMock(optIn: { id: string } | null = { id: 'optin-1' }) {
      const insertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'history-1' }, error: null }),
        }),
      });
      const queueUpdateEq = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: queueUpdateEq });

      const from = vi.fn().mockImplementation((table: string) => {
        if (table === 'notification_history') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
            }),
            insert: insertMock,
          };
        }
        if (table === 'notification_queue') {
          return { update: updateMock };
        }
        // whatsapp_optins
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: optIn, error: null }),
        };
      });

      return { from, insertMock, updateMock };
    }

    it('writes exactly one history row, on channel "sms", carrying the queue_id and fallback_from, for a successful fallback', async () => {
      vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
        success: false,
        error: 'Chatmaid bridge is disconnected',
      });
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(chatmaidConfigResult);
      vi.mocked(sendSms).mockResolvedValue({ success: true, messageId: 'termii-1' });

      const { from, insertMock } = buildSupabaseMock();
      vi.mocked(createAdminClient).mockReturnValue({
        from,
      } as unknown as ReturnType<typeof createAdminClient>);

      const item = buildQueueItem();
      const result = await sendAndRecordNotification(item);

      expect(result.success).toBe(true);
      expect(insertMock).toHaveBeenCalledTimes(1);
      const insertedRow = insertMock.mock.calls[0][0] as Record<string, unknown>;
      expect(insertedRow.channel).toBe('sms');
      expect(insertedRow.queue_id).toBe(item.id);
      expect(insertedRow.status).toBe('sent');
      expect((insertedRow.metadata as Record<string, unknown>).fallback_from).toBe('whatsapp');
      expect((insertedRow.metadata as Record<string, unknown>).whatsappError).toBe(
        'Chatmaid bridge is disconnected'
      );
    });

    it('writes the normal "whatsapp" channel history row when no fallback fires', async () => {
      vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
        success: true,
        messageId: 'msg_1',
      });
      vi.mocked(resolveWhatsAppConfig).mockResolvedValue(chatmaidConfigResult);

      const { from, insertMock } = buildSupabaseMock();
      vi.mocked(createAdminClient).mockReturnValue({
        from,
      } as unknown as ReturnType<typeof createAdminClient>);

      const item = buildQueueItem();
      await sendAndRecordNotification(item);

      expect(insertMock).toHaveBeenCalledTimes(1);
      const insertedRow = insertMock.mock.calls[0][0] as Record<string, unknown>;
      expect(insertedRow.channel).toBe('whatsapp');
      expect((insertedRow.metadata as Record<string, unknown>).fallback_from).toBeUndefined();
    });
  });
});
