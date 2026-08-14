import { describe, expect, it } from 'vitest';
import {
  buildAnnouncementWhatsApp,
  buildInvoiceReminderWhatsApp,
  buildPaymentReceivedWhatsApp,
} from '@/lib/whatsapp/outbound';

describe('WhatsApp outbound producers', () => {
  it('builds an invoice reminder queue item with safe template variables', () => {
    const item = buildInvoiceReminderWhatsApp({
      invoiceId: 'invoice-1',
      invoiceNumber: 'INV-001',
      residentId: 'resident-1',
      residentPhone: '+2348000000000',
      residentName: 'Ada Example',
      amountRemaining: 12500,
      dueDate: '12 August 2026',
    });

    expect(item).toMatchObject({
      recipient_id: 'resident-1',
      recipient_phone: '+2348000000000',
      channel: 'whatsapp',
    });
    expect(item.metadata?.whatsapp_template).toEqual({
      name: 'invoice_reminder',
      languageCode: 'en_US',
      parameters: ['Ada Example', 'INV-001', 'NGN 12,500', '12 August 2026'],
    });
  });

  it('builds a deduplicated payment confirmation', () => {
    const item = buildPaymentReceivedWhatsApp({
      paymentId: 'payment-1',
      residentId: 'resident-1',
      residentPhone: '+2348000000000',
      residentName: 'Ada Example',
      amount: 5000,
      paymentDate: '12/08/2026',
      referenceNumber: 'BANK-1',
    });

    expect(item.deduplication_key).toBe('payment_received:payment-1');
    expect(item.metadata?.whatsapp_template).toMatchObject({
      name: 'payment_received',
      parameters: ['Ada Example', 'NGN 5,000', '12/08/2026', 'BANK-1'],
    });
  });

  it('truncates announcement content passed to the template', () => {
    const item = buildAnnouncementWhatsApp({
      announcementId: 'announcement-1',
      residentId: 'resident-1',
      residentPhone: '+2348000000000',
      title: 'Gate notice',
      content: 'x'.repeat(600),
    });
    const template = item.metadata?.whatsapp_template as { name: string; parameters: string[] };

    expect(item.priority).toBe(1);
    expect(item.deduplication_key).toBe('announcement:announcement-1:resident-1');
    expect(template.name).toBe('announcement');
    expect(template.parameters[1]).toHaveLength(500);
  });
});
