import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMPLEMENTED_CHANNELS } from '../types';
import { sendNotification } from '../send';
import { getSettingValue } from '@/actions/settings/get-settings';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

vi.mock('@/actions/settings/get-settings', () => ({
  getSettingValue: vi.fn(),
}));

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: vi.fn(),
}));

describe('WhatsApp notification dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettingValue).mockResolvedValue(true);
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
      to: '2348000000000',
      body: 'Reminder',
    });
  });
});
