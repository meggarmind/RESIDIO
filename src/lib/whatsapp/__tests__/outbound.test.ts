import { describe, expect, it } from 'vitest';
import {
  buildAnnouncementWhatsApp,
  buildInvoiceReminderWhatsApp,
  buildPaymentReceivedWhatsApp,
} from '@/lib/whatsapp/outbound';

describe('WhatsApp outbound producers', () => {
  describe('buildInvoiceReminderWhatsApp', () => {
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
      const template = (item.metadata as Record<string, unknown>)
        ?.whatsapp_template as Record<string, unknown>;
      expect(template.name).toBe('invoice_reminder');
      expect(template.languageCode).toBe('en_US');
      expect(template.parameters).toEqual([
        'Ada Example',
        'INV-001',
        'NGN 12,500',
        '12 August 2026',
      ]);
    });

    it('renders amount in NGN locale', () => {
      const item = buildInvoiceReminderWhatsApp({
        invoiceId: 'inv-2',
        invoiceNumber: 'INV-002',
        residentId: 'res-2',
        residentPhone: '+2348000000001',
        residentName: 'Chidi',
        amountRemaining: 100000,
        dueDate: '1 Sep',
      });
      const template = (item.metadata as Record<string, unknown>)
        ?.whatsapp_template as Record<string, unknown>;
      expect((template.parameters as string[])[2]).toBe('NGN 100,000');
    });

    it('uses the approved invoice_reminder template name', () => {
      const item = buildInvoiceReminderWhatsApp({
        invoiceId: 'inv-3',
        invoiceNumber: 'INV-003',
        residentId: 'res-3',
        residentPhone: '+2348000000002',
        residentName: 'Ngozi',
        amountRemaining: 500,
        dueDate: '5 Oct',
      });
      const template = (item.metadata as Record<string, unknown>)
        ?.whatsapp_template as Record<string, unknown>;
      expect(template.name).toBe('invoice_reminder');
    });
  });

  describe('buildPaymentReceivedWhatsApp', () => {
    it('builds a payment confirmation with deduplication key', () => {
      const item = buildPaymentReceivedWhatsApp({
        paymentId: 'payment-1',
        residentId: 'resident-1',
        residentPhone: '+2348000000000',
        residentName: 'Ada Example',
        amount: 5000,
        paymentDate: '01/09/2026',
        referenceNumber: 'REF-001',
      });

      expect(item.channel).toBe('whatsapp');
      expect(item.deduplication_key).toBe('payment_received:payment-1');
      const template = (item.metadata as Record<string, unknown>)
        ?.whatsapp_template as Record<string, unknown>;
      expect(template.name).toBe('payment_received');
      expect(template.parameters).toEqual([
        'Ada Example',
        'NGN 5,000',
        '01/09/2026',
        'REF-001',
      ]);
    });

    it('defaults missing reference to Not provided', () => {
      const item = buildPaymentReceivedWhatsApp({
        paymentId: 'pay-no-ref',
        residentId: 'res-4',
        residentPhone: '+2348000000000',
        residentName: 'Uche',
        amount: 20000,
        paymentDate: '01/01/2026',
      });
      const template = (item.metadata as Record<string, unknown>)
        ?.whatsapp_template as Record<string, unknown>;
      expect((template.parameters as string[])[3]).toBe('Not provided');
    });

    it('uses the approved payment_received template name', () => {
      const item = buildPaymentReceivedWhatsApp({
        paymentId: 'pay-approved',
        residentId: 'res-5',
        residentPhone: '+2348000000000',
        residentName: 'Amara',
        amount: 3000,
        paymentDate: '10/03/2026',
      });
      const template = (item.metadata as Record<string, unknown>)
        ?.whatsapp_template as Record<string, unknown>;
      expect(template.name).toBe('payment_received');
    });

    it('creates a per-payment deduplication key', () => {
      const item = buildPaymentReceivedWhatsApp({
        paymentId: 'pay-dedup',
        residentId: 'res-6',
        residentPhone: '+2348000000000',
        residentName: 'Chika',
        amount: 1000,
        paymentDate: '1/2/2026',
      });
      expect(item.deduplication_key).toBe('payment_received:pay-dedup');
    });
  });

  describe('buildAnnouncementWhatsApp', () => {
    it('builds an announcement queue item with summary parameter', () => {
      const item = buildAnnouncementWhatsApp({
        announcementId: 'ann-1',
        residentId: 'res-1',
        residentPhone: '+2348000000000',
        title: 'Gate Maintenance',
        content: 'The main gate will be closed on Saturday for maintenance.',
        summary: 'Main gate closed Saturday.',
      });

      expect(item.channel).toBe('whatsapp');
      expect(item.deduplication_key).toBe('announcement:ann-1:res-1');
      const template = (item.metadata as Record<string, unknown>)
        ?.whatsapp_template as Record<string, unknown>;
      expect(template.name).toBe('announcement');
      expect(template.parameters).toEqual(['Gate Maintenance', 'Main gate closed Saturday.']);
    });

    it('falls back to truncated content when summary is absent', () => {
      const item = buildAnnouncementWhatsApp({
        announcementId: 'ann-2',
        residentId: 'res-2',
        residentPhone: '+2348000000000',
        title: 'Alert',
        content: 'Short content here.',
      });
      const template = (item.metadata as Record<string, unknown>)
        ?.whatsapp_template as Record<string, unknown>;
      expect((template.parameters as string[])[1]).toBe('Short content here.');
    });

    it('truncates long content to 500 characters when summary is absent', () => {
      const longContent = 'A'.repeat(600);
      const item = buildAnnouncementWhatsApp({
        announcementId: 'ann-3',
        residentId: 'res-3',
        residentPhone: '+2348000000000',
        title: 'Long Alert',
        content: longContent,
      });
      const template = (item.metadata as Record<string, unknown>)
        ?.whatsapp_template as Record<string, unknown>;
      expect(String((template.parameters as string[])[1]).length).toBe(500);
    });

    it('creates per-resident deduplication keys', () => {
      const item1 = buildAnnouncementWhatsApp({
        announcementId: 'ann-5',
        residentId: 'res-a',
        residentPhone: '+2348000000000',
        title: 'T',
        content: 'C',
      });
      const item2 = buildAnnouncementWhatsApp({
        announcementId: 'ann-5',
        residentId: 'res-b',
        residentPhone: '+2348000000000',
        title: 'T',
        content: 'C',
      });
      expect(item1.deduplication_key).toBe('announcement:ann-5:res-a');
      expect(item2.deduplication_key).toBe('announcement:ann-5:res-b');
      expect(item1.deduplication_key).not.toBe(item2.deduplication_key);
    });
  });
});
