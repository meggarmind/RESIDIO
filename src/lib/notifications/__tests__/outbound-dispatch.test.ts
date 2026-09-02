import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMPLEMENTED_CHANNELS } from '@/lib/notifications/types';
import { sendNotification } from '@/lib/notifications/send';
import { getSettingValueAsService } from '@/actions/settings/get-settings';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { createAdminClient } from '@/lib/supabase/server';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';

vi.mock('@/actions/settings/get-settings', () => ({
  getSettingValueAsService: vi.fn(),
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

function queueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'queue-1',
    template_id: null,
    schedule_id: null,
    recipient_id: 'resident-1',
    recipient_email: null,
    recipient_phone: '2348000000000',
    channel: 'whatsapp' as const,
    subject: null,
    body: 'Test body',
    html_body: null,
    variables: null,
    priority: 5,
    status: 'pending' as const,
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
    ...overrides,
  };
}

function mockSupabaseChain(overrides: Record<string, unknown> = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'optin-1' },
        error: null,
        ...overrides,
      }),
    }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

describe('WhatsApp outbound dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSettingValueAsService).mockResolvedValue(true);
    vi.mocked(createAdminClient).mockReturnValue(mockSupabaseChain());
  });

  it('advertises WhatsApp but not dormant SMS as implemented', () => {
    expect(IMPLEMENTED_CHANNELS).toEqual(['email', 'whatsapp']);
  });

  it('rejects WhatsApp sends without a template', async () => {
    const result = await sendNotification(queueItem({ metadata: null }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('WhatsApp proactive sends require an approved template');
  });

  it('rejects WhatsApp sends with a non-approved template name', async () => {
    const result = await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'custom_spam',
            languageCode: 'en_US',
            parameters: ['Hello'],
          },
        },
      })
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('WhatsApp template is not approved for proactive delivery');
  });

  it('sends an approved template through the provider seam', async () => {
    vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
      success: true,
      messageId: 'wamid.outbound-1',
    });

    const result = await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'invoice_reminder',
            languageCode: 'en_US',
            parameters: ['Ada', 'INV-001', 'NGN 10,000', '1 September 2026'],
          },
        },
      })
    );

    expect(result).toEqual({ success: true, externalId: 'wamid.outbound-1', error: undefined });
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith({
      to: '+2348000000000',
      templateName: 'invoice_reminder',
      languageCode: 'en_US',
      parameters: ['Ada', 'INV-001', 'NGN 10,000', '1 September 2026'],
    });
  });

  it('rejects WhatsApp sends when the daily cap is reached', async () => {
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

    const result = await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'invoice_reminder',
            languageCode: 'en_US',
            parameters: ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'],
          },
        },
      })
    );

    expect(result).toEqual({ success: false, error: 'WhatsApp daily outbound limit reached' });
  });

  it('rejects sends when the cap setting is zero', async () => {
    vi.mocked(getSettingValueAsService).mockImplementation(async (key) => {
      if (key === 'whatsapp_outbound_daily_cap') return 0;
      return true;
    });

    const result = await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'payment_received',
            languageCode: 'en_US',
            parameters: ['Ada', 'NGN 5,000', '01/09', 'REF'],
          },
        },
      })
    );

    expect(result).toEqual({ success: false, error: 'WhatsApp outbound notifications are capped at zero' });
  });

  it('rejects sends when rollout is disabled', async () => {
    vi.mocked(isWhatsAppRecipientAllowed).mockResolvedValueOnce(false);

    const result = await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'announcement',
            languageCode: 'en_US',
            parameters: ['Title', 'Summary'],
          },
        },
      })
    );

    expect(result).toEqual({
      success: false,
      error: 'WhatsApp recipient is outside the active rollout audience',
    });
  });

  it('rejects when recipient has not opted in', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'invoice_reminder',
            languageCode: 'en_US',
            parameters: ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'],
          },
        },
      })
    );

    expect(result).toEqual({ success: false, error: 'WhatsApp recipient has not opted in' });
  });

  it('rejects sends when WhatsApp is disabled in settings', async () => {
    vi.mocked(getSettingValueAsService).mockImplementation(async (key) => {
      if (key === 'whatsapp_enabled') return false;
      return true;
    });

    const result = await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'payment_received',
            languageCode: 'en_US',
            parameters: ['Ada', 'NGN 5,000', '01/09', 'REF'],
          },
        },
      })
    );

    expect(result).toEqual({ success: false, error: 'WhatsApp notifications are disabled in system settings' });
  });

  it('rejects when recipient phone is missing', async () => {
    const result = await sendNotification(
      queueItem({
        recipient_phone: null,
        metadata: {
          whatsapp_template: {
            name: 'invoice_reminder',
            languageCode: 'en_US',
            parameters: ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'],
          },
        },
      })
    );

    expect(result).toEqual({ success: false, error: 'No recipient phone number provided' });
  });

  it('returns provider error when sendWhatsAppTemplate fails', async () => {
    vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
      success: false,
      error: 'Meta API rate limit exceeded',
    });

    const result = await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'announcement',
            languageCode: 'en_US',
            parameters: ['Title', 'Summary'],
          },
        },
      })
    );

    expect(result).toEqual({
      success: false,
      error: 'Meta API rate limit exceeded',
      externalId: undefined,
    });
  });

  it('rejects sends when consent lookup fails', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'payment_received',
            languageCode: 'en_US',
            parameters: ['Ada', 'NGN 5,000', '01/09', 'REF'],
          },
        },
      })
    );

    expect(result).toEqual({ success: false, error: 'Unable to verify WhatsApp consent' });
  });

  it('rejects sends when cap lookup fails', async () => {
    vi.mocked(getSettingValueAsService).mockImplementation(async (key) => {
      if (key === 'whatsapp_outbound_daily_cap') return 100;
      return true;
    });
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'notification_history') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ count: null, error: { message: 'db error' } }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'optin-1' }, error: null }),
        };
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const result = await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'invoice_reminder',
            languageCode: 'en_US',
            parameters: ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'],
          },
        },
      })
    );

    expect(result).toEqual({ success: false, error: 'Unable to verify WhatsApp outbound limit' });
  });

  it('passes payment_received template parameters correctly', async () => {
    vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
      success: true,
      messageId: 'wamid.pay-1',
    });

    await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'payment_received',
            languageCode: 'en_US',
            parameters: ['Chidi Okonkwo', 'NGN 25,000', '15/08/2026', 'PAYSTACK-TXN-123'],
          },
        },
      })
    );

    expect(sendWhatsAppTemplate).toHaveBeenCalledWith({
      to: '+2348000000000',
      templateName: 'payment_received',
      languageCode: 'en_US',
      parameters: ['Chidi Okonkwo', 'NGN 25,000', '15/08/2026', 'PAYSTACK-TXN-123'],
    });
  });

  it('passes announcement template parameters correctly', async () => {
    vi.mocked(sendWhatsAppTemplate).mockResolvedValue({
      success: true,
      messageId: 'wamid.ann-1',
    });

    await sendNotification(
      queueItem({
        metadata: {
          whatsapp_template: {
            name: 'announcement',
            languageCode: 'en_US',
            parameters: ['Gate Maintenance', 'The main gate will be closed on Saturday.'],
          },
        },
      })
    );

    expect(sendWhatsAppTemplate).toHaveBeenCalledWith({
      to: '+2348000000000',
      templateName: 'announcement',
      languageCode: 'en_US',
      parameters: ['Gate Maintenance', 'The main gate will be closed on Saturday.'],
    });
  });
});
