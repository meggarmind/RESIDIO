import { describe, expect, it } from 'vitest';
import {
  WHATSAPP_TEMPLATE_NAMES,
  isApprovedWhatsAppTemplateName,
  whatsappTemplate,
} from '@/lib/whatsapp/templates';

describe('WhatsApp templates', () => {
  describe('WHATSAPP_TEMPLATE_NAMES', () => {
    it('contains exactly three approved template names', () => {
      const names = Object.values(WHATSAPP_TEMPLATE_NAMES);
      expect(names).toHaveLength(3);
      expect(names).toContain('invoice_reminder');
      expect(names).toContain('payment_received');
      expect(names).toContain('announcement');
    });
  });

  describe('isApprovedWhatsAppTemplateName', () => {
    it('approves all three built-in template names', () => {
      expect(isApprovedWhatsAppTemplateName('invoice_reminder')).toBe(true);
      expect(isApprovedWhatsAppTemplateName('payment_received')).toBe(true);
      expect(isApprovedWhatsAppTemplateName('announcement')).toBe(true);
    });

    it('rejects unknown template names', () => {
      expect(isApprovedWhatsAppTemplateName('custom_spam')).toBe(false);
      expect(isApprovedWhatsAppTemplateName('')).toBe(false);
      expect(isApprovedWhatsAppTemplateName('INVOICE_REMINDER')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(isApprovedWhatsAppTemplateName(null)).toBe(false);
      expect(isApprovedWhatsAppTemplateName(undefined)).toBe(false);
      expect(isApprovedWhatsAppTemplateName(123)).toBe(false);
    });
  });

  describe('whatsappTemplate', () => {
    it('builds a template object with en_US language code', () => {
      const result = whatsappTemplate('invoice_reminder', ['Ada', 'INV-001', 'NGN 10,000', '1 Sep']);
      expect(result).toEqual({
        name: 'invoice_reminder',
        languageCode: 'en_US',
        parameters: ['Ada', 'INV-001', 'NGN 10,000', '1 Sep'],
      });
    });

    it('converts numeric parameters to strings', () => {
      const result = whatsappTemplate('payment_received', ['Ada', 25000, '12/08/2026', 'REF']);
      expect(result.parameters).toEqual(['Ada', '25000', '12/08/2026', 'REF']);
    });

    it('handles empty parameters array', () => {
      const result = whatsappTemplate('announcement', []);
      expect(result.parameters).toEqual([]);
    });
  });
});
