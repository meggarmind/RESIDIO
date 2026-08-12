import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMPLEMENTED_CHANNELS } from '@/lib/notifications/types';
import { sendNotification } from '@/lib/notifications/send';
import { getSettingValue } from '@/actions/settings/get-settings';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('@/actions/settings/get-settings', () => ({
  getSettingValue: vi.fn(),
}));

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
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

  it('sends a WhatsApp queue item through the provider seam', async () => {
    vi.mocked(sendWhatsAppMessage).mockResolvedValue({
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
      metadata: null,
      created_at: new Date().toISOString(),
      created_by: null,
    });

    expect(result).toEqual({ success: true, externalId: 'wamid.outbound-1', error: undefined });
    expect(sendWhatsAppMessage).toHaveBeenCalledWith({
      to: '+2348000000000',
      body: 'Reminder',
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
      metadata: null,
      created_at: new Date().toISOString(),
      created_by: null,
    })).resolves.toEqual({ success: false, error: 'WhatsApp daily outbound limit reached' });
  });
});
