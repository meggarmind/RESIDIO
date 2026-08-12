export const WHATSAPP_TEMPLATE_NAMES = {
  invoiceReminder: 'invoice_reminder',
  paymentReceived: 'payment_received',
  announcement: 'announcement',
} as const;

export type WhatsAppTemplateName =
  (typeof WHATSAPP_TEMPLATE_NAMES)[keyof typeof WHATSAPP_TEMPLATE_NAMES];

export function isApprovedWhatsAppTemplateName(value: unknown): value is WhatsAppTemplateName {
  return Object.values(WHATSAPP_TEMPLATE_NAMES).includes(value as WhatsAppTemplateName);
}

export function whatsappTemplate(
  name: WhatsAppTemplateName,
  parameters: Array<string | number>
) {
  return {
    name,
    languageCode: 'en_US',
    parameters: parameters.map(String),
  };
}
