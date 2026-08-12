import { PRIORITY } from '@/lib/notifications/queue';
import { WHATSAPP_TEMPLATE_NAMES, whatsappTemplate } from '@/lib/whatsapp/templates';
import type { QueueNotificationInput } from '@/lib/notifications/types';

export function buildInvoiceReminderWhatsApp(input: {
  invoiceId: string;
  invoiceNumber: string;
  residentId: string;
  residentPhone: string;
  residentName: string;
  amountRemaining: number;
  dueDate: string;
}): QueueNotificationInput {
  const amount = `NGN ${input.amountRemaining.toLocaleString('en-NG')}`;
  return {
    recipient_id: input.residentId,
    recipient_phone: input.residentPhone,
    channel: 'whatsapp',
    body: `Invoice ${input.invoiceNumber}: ${amount} due ${input.dueDate}.`,
    metadata: {
      invoiceId: input.invoiceId,
      invoiceNumber: input.invoiceNumber,
      whatsapp_template: whatsappTemplate(WHATSAPP_TEMPLATE_NAMES.invoiceReminder, [
        input.residentName,
        input.invoiceNumber,
        amount,
        input.dueDate,
      ]),
    },
  };
}

export function buildPaymentReceivedWhatsApp(input: {
  paymentId: string;
  residentId: string;
  residentPhone: string;
  residentName: string;
  amount: number;
  paymentDate: string;
  referenceNumber?: string | null;
}): QueueNotificationInput {
  const amount = `NGN ${input.amount.toLocaleString('en-NG')}`;
  return {
    recipient_id: input.residentId,
    recipient_phone: input.residentPhone,
    channel: 'whatsapp',
    body: `Payment received: ${amount}.`,
    priority: PRIORITY.NORMAL,
    deduplication_key: `payment_received:${input.paymentId}`,
    metadata: {
      paymentId: input.paymentId,
      whatsapp_template: whatsappTemplate(WHATSAPP_TEMPLATE_NAMES.paymentReceived, [
        input.residentName,
        amount,
        input.paymentDate,
        input.referenceNumber || 'Not provided',
      ]),
    },
  };
}

export function buildAnnouncementWhatsApp(input: {
  announcementId: string;
  residentId: string;
  residentPhone: string;
  title: string;
  content: string;
  summary?: string;
}): QueueNotificationInput {
  const summary = input.summary || input.content.substring(0, 500);
  return {
    recipient_id: input.residentId,
    recipient_phone: input.residentPhone,
    channel: 'whatsapp',
    body: `Announcement: ${input.title}\n\n${input.summary || input.content}`,
    priority: PRIORITY.URGENT,
    deduplication_key: `announcement:${input.announcementId}:${input.residentId}`,
    metadata: {
      announcementId: input.announcementId,
      whatsapp_template: whatsappTemplate(WHATSAPP_TEMPLATE_NAMES.announcement, [
        input.title,
        summary,
      ]),
    },
  };
}
