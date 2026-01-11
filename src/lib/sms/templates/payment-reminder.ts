/**
 * SMS Templates for Payment Reminders
 *
 * SMS messages are character-limited, so templates are concise.
 * Standard SMS = 160 chars (single segment)
 * Extended SMS = 306 chars (2 segments)
 *
 * We aim for single-segment messages where possible.
 */

import type { ReminderEscalationLevel } from '@/emails/payment-reminder-escalated';

interface SmsTemplateParams {
  residentName: string;
  invoiceNumber: string;
  amountDue: number;
  dueDate: string;
  daysUntilDue: number;
  estateName: string;
  paymentUrl?: string;
}

/**
 * Format currency for SMS (shorter format)
 */
function formatAmount(amount: number): string {
  if (amount >= 1000000) {
    return `N${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `N${(amount / 1000).toFixed(0)}K`;
  }
  return `N${amount.toLocaleString()}`;
}

/**
 * Format due text for SMS
 */
function formatDueText(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    const days = Math.abs(daysUntilDue);
    return days === 1 ? '1 day overdue' : `${days} days overdue`;
  }
  if (daysUntilDue === 0) return 'due today';
  if (daysUntilDue === 1) return 'due tomorrow';
  return `due in ${daysUntilDue} days`;
}

/**
 * SMS templates by escalation level
 * Each template includes a short and long version
 */
const smsTemplates: Record<
  ReminderEscalationLevel,
  {
    short: (params: SmsTemplateParams) => string;
    long: (params: SmsTemplateParams) => string;
  }
> = {
  friendly: {
    short: (p) =>
      `${p.estateName}: Payment reminder - ${formatAmount(p.amountDue)} ${formatDueText(p.daysUntilDue)} (Inv: ${p.invoiceNumber})`,
    long: (p) =>
      `Hi ${p.residentName.split(' ')[0]}, this is a friendly reminder that your payment of ${formatAmount(p.amountDue)} is ${formatDueText(p.daysUntilDue)}. Invoice: ${p.invoiceNumber}. - ${p.estateName}`,
  },
  warning: {
    short: (p) =>
      `${p.estateName}: Payment ${formatDueText(p.daysUntilDue)} - ${formatAmount(p.amountDue)}. Pay before ${p.dueDate} to avoid late fees. Inv: ${p.invoiceNumber}`,
    long: (p) =>
      `Dear ${p.residentName.split(' ')[0]}, your payment of ${formatAmount(p.amountDue)} is ${formatDueText(p.daysUntilDue)}. Please pay by ${p.dueDate} to avoid late fees. Invoice: ${p.invoiceNumber}. - ${p.estateName}`,
  },
  urgent: {
    short: (p) =>
      `URGENT: ${p.estateName} - ${formatAmount(p.amountDue)} ${formatDueText(p.daysUntilDue)}! Pay now to avoid penalties. Inv: ${p.invoiceNumber}`,
    long: (p) =>
      `URGENT: ${p.residentName.split(' ')[0]}, your ${formatAmount(p.amountDue)} payment is ${formatDueText(p.daysUntilDue)}! Please pay immediately to avoid late fees. Invoice: ${p.invoiceNumber}. - ${p.estateName}`,
  },
  final: {
    short: (p) =>
      `FINAL NOTICE: ${p.estateName} - ${formatAmount(p.amountDue)} due TODAY! Pay now: ${p.invoiceNumber}. Late fees apply after today.`,
    long: (p) =>
      `FINAL NOTICE: ${p.residentName.split(' ')[0]}, your payment of ${formatAmount(p.amountDue)} is due TODAY. Failure to pay will result in late fees. Invoice: ${p.invoiceNumber}. Contact us if you need help. - ${p.estateName}`,
  },
  overdue: {
    short: (p) =>
      `OVERDUE: ${p.estateName} - ${formatAmount(p.amountDue)} is ${formatDueText(p.daysUntilDue)}! Pay immediately. Late fees applied. Inv: ${p.invoiceNumber}`,
    long: (p) =>
      `OVERDUE ALERT: ${p.residentName.split(' ')[0]}, your ${formatAmount(p.amountDue)} payment is ${formatDueText(p.daysUntilDue)}. Late fees have been applied. Pay immediately or contact estate management. Inv: ${p.invoiceNumber}. - ${p.estateName}`,
  },
};

/**
 * Generate SMS content for payment reminder
 *
 * @param params - Template parameters
 * @param escalationLevel - Urgency level of the reminder
 * @param preferShort - Use short template (default: auto-detect based on URL)
 * @returns SMS message content
 */
export function generatePaymentReminderSms(
  params: SmsTemplateParams,
  escalationLevel: ReminderEscalationLevel,
  preferShort?: boolean
): string {
  const template = smsTemplates[escalationLevel];

  // If payment URL is provided, use short template to leave room for URL
  const useShort = preferShort ?? !!params.paymentUrl;

  let message = useShort ? template.short(params) : template.long(params);

  // Append payment URL if provided and there's room
  if (params.paymentUrl) {
    const urlSuffix = ` Pay: ${params.paymentUrl}`;
    // Only append if total length stays under 306 chars (2 SMS segments)
    if (message.length + urlSuffix.length <= 306) {
      message += urlSuffix;
    }
  }

  return message;
}

/**
 * Generate WhatsApp message for payment reminder
 * WhatsApp allows longer messages with formatting
 */
export function generatePaymentReminderWhatsApp(
  params: SmsTemplateParams,
  escalationLevel: ReminderEscalationLevel
): string {
  const firstName = params.residentName.split(' ')[0];
  const amount = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(params.amountDue);

  const isOverdue = params.daysUntilDue < 0;

  // WhatsApp supports basic formatting: *bold*, _italic_
  const templates: Record<ReminderEscalationLevel, string> = {
    friendly: `Hello ${firstName}!

This is a friendly reminder from *${params.estateName}*.

*Invoice:* ${params.invoiceNumber}
*Amount:* ${amount}
*Due Date:* ${params.dueDate}

Please ensure payment is made by the due date.${params.paymentUrl ? `\n\nPay here: ${params.paymentUrl}` : ''}

Thank you!`,

    warning: `Dear ${firstName},

*Payment Reminder* from ${params.estateName}

Your payment is due soon:
*Invoice:* ${params.invoiceNumber}
*Amount:* ${amount}
*Due Date:* ${params.dueDate}

Please pay before the due date to avoid late fees.${params.paymentUrl ? `\n\nPay now: ${params.paymentUrl}` : ''}`,

    urgent: `*URGENT* Payment Reminder

Dear ${firstName},

Your payment of *${amount}* is due *${formatDueText(params.daysUntilDue)}*!

*Invoice:* ${params.invoiceNumber}
*Due Date:* ${params.dueDate}

Please pay immediately to avoid penalties.${params.paymentUrl ? `\n\n*Pay Now:* ${params.paymentUrl}` : ''}

- ${params.estateName}`,

    final: `*FINAL NOTICE*

Dear ${firstName},

Your payment of *${amount}* is due *TODAY*.

*Invoice:* ${params.invoiceNumber}

Failure to pay today will result in:
- Late fees
- Potential service restrictions

Please make payment immediately or contact estate management if you need assistance.${params.paymentUrl ? `\n\n*Pay Now:* ${params.paymentUrl}` : ''}

- ${params.estateName} Management`,

    overdue: `*OVERDUE PAYMENT ALERT*

Dear ${firstName},

Your payment of *${amount}* is now *${Math.abs(params.daysUntilDue)} day(s) OVERDUE*.

*Invoice:* ${params.invoiceNumber}
*Original Due Date:* ${params.dueDate}

Late fees have been applied to your account.

Please settle this amount immediately to avoid further penalties.${params.paymentUrl ? `\n\n*Settle Now:* ${params.paymentUrl}` : ''}

Contact us if you need to discuss payment arrangements.

- ${params.estateName} Management`,
  };

  return templates[escalationLevel];
}

/**
 * Determine channel-appropriate message based on content length
 */
export function getOptimalChannel(
  params: SmsTemplateParams,
  escalationLevel: ReminderEscalationLevel
): 'sms' | 'whatsapp' {
  const smsMessage = generatePaymentReminderSms(params, escalationLevel, false);

  // If SMS would be over 2 segments (306 chars), prefer WhatsApp
  if (smsMessage.length > 306) {
    return 'whatsapp';
  }

  // For urgent/overdue messages, WhatsApp provides better formatting
  if (escalationLevel === 'urgent' || escalationLevel === 'final' || escalationLevel === 'overdue') {
    return 'whatsapp';
  }

  return 'sms';
}

export type { SmsTemplateParams };
