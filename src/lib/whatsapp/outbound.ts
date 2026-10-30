import { PRIORITY } from '@/lib/notifications/queue';
import { WHATSAPP_TEMPLATE_NAMES, whatsappTemplate } from '@/lib/whatsapp/templates';
import { formatDay } from '@/lib/whatsapp/assistant-format';
import type { QueueNotificationInput } from '@/lib/notifications/types';

export function buildInvoiceReminderWhatsApp(input: {
  invoiceId: string;
  invoiceNumber: string;
  residentId: string;
  residentPhone: string;
  residentName: string;
  amountRemaining: number;
  /** A `YYYY-MM-DD` day or an instant; shown as `dd mmm yyyy` (CORE.md section 4). */
  dueDate: string | Date;
}): QueueNotificationInput {
  const dueDate = formatDay(input.dueDate);
  const amount = `NGN ${input.amountRemaining.toLocaleString('en-NG')}`;
  return {
    recipient_id: input.residentId,
    recipient_phone: input.residentPhone,
    channel: 'whatsapp',
    body: `Invoice ${input.invoiceNumber}: ${amount} due ${dueDate}.`,
    metadata: {
      invoiceId: input.invoiceId,
      invoiceNumber: input.invoiceNumber,
      whatsapp_template: whatsappTemplate(WHATSAPP_TEMPLATE_NAMES.invoiceReminder, [
        input.residentName,
        input.invoiceNumber,
        amount,
        dueDate,
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
  paymentDate: string | Date;
  referenceNumber?: string | null;
}): QueueNotificationInput {
  const paymentDate = formatDay(input.paymentDate);
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
        paymentDate,
        // No bank reference (a FirstBank alert has none, #1356): the payment's receipt number, in
        // the same RCP- form the email and PDF receipts print for it. Never stored as the reference.
        input.referenceNumber || `RCP-${input.paymentId.slice(0, 8).toUpperCase()}`,
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

/**
 * Dues paid by landlord (#1192): one reminder for all of a landlord's flagged flats, on the approved
 * invoice_reminder template. The invoice slot carries the amount per flat.
 */
export function buildLandlordDuesReminderWhatsApp(input: {
  landlordId: string;
  landlordPhone: string;
  landlordName: string;
  /** `F1, Main Street NGN 50,000; F2, Main Street NGN 50,000`. */
  flatLines: string;
  total: number;
  /** The earliest due date of the flats, shown as `dd mmm yyyy` (CORE.md section 4). */
  dueDate: string | Date;
  dedupeDay: string;
}): QueueNotificationInput {
  const dueDate = formatDay(input.dueDate);
  const amount = `NGN ${input.total.toLocaleString('en-NG')}`;
  const reference = `Dues for your flats: ${input.flatLines}`;
  return {
    recipient_id: input.landlordId,
    recipient_phone: input.landlordPhone,
    channel: 'whatsapp',
    body: `${reference}. Total ${amount} due ${dueDate}.`,
    deduplication_key: `landlord-dues-reminder:${input.landlordId}:${input.dedupeDay}`,
    metadata: {
      whatsapp_template: whatsappTemplate(WHATSAPP_TEMPLATE_NAMES.invoiceReminder, [
        input.landlordName,
        reference,
        amount,
        dueDate,
      ]),
    },
  };
}

/**
 * Dues paid by landlord (#1192): a receipt for a split of a landlord payment, on the approved
 * payment_received template. The reference slot says what was paid: the amount per flat for the
 * landlord, "paid by your landlord" and the months for a tenant.
 */
export function buildLandlordDuesReceiptWhatsApp(input: {
  splitId: string;
  residentId: string;
  residentPhone: string;
  residentName: string;
  amount: number;
  paymentDate: string | Date;
  note: string;
}): QueueNotificationInput {
  const paymentDate = formatDay(input.paymentDate);
  const amount = `NGN ${input.amount.toLocaleString('en-NG')}`;
  return {
    recipient_id: input.residentId,
    recipient_phone: input.residentPhone,
    channel: 'whatsapp',
    body: `${input.note}. ${amount} on ${paymentDate}.`,
    priority: PRIORITY.NORMAL,
    deduplication_key: `landlord-dues-receipt:${input.splitId}:${input.residentId}`,
    metadata: {
      whatsapp_template: whatsappTemplate(WHATSAPP_TEMPLATE_NAMES.paymentReceived, [
        input.residentName,
        amount,
        paymentDate,
        input.note,
      ]),
    },
  };
}
