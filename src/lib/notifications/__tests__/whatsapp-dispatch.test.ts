import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMPLEMENTED_CHANNELS } from '@/lib/notifications/types';
import { sendNotification } from '@/lib/notifications/send';
import { getSettingValue } from '@/actions/settings/get-settings';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { createAdminClient } from '@/lib/supabase/server';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';

vi.mock('@/actions/settings/get-settings', () => ({
  getSettingValue: vi.fn(),
}));

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppTemplate: vi.fn(),
  isApprovedWhatsAppTemplateName: vi.fn((name: string) =>
    ['invoice_reminder', 'payment_received', 'announcement'].includes(name)
  ),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/whatsapp/rollout', () => ({
  isWhatsAppRecipientAllowed: vi.fn().mockResolvedValue(true),
}));

describe('WhatsApp notification dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettingValue).mockResolvedValue(true);
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
    vi.mocked(getSettingValue).mockImplementation(async (key) => {
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
    vi.mocked(getSettingValue).mockImplementation(async (key) => {
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
});
