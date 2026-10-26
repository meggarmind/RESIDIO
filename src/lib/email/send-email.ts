import { getEmailTransportError, sendViaResend } from './transport';
import { createAdminClient } from '@/lib/supabase/server';
import { getRawSettingsAsService, getSettingValueAsService } from '@/lib/settings/service';
import { usableEstateLogoUrl } from '@/lib/branding/estate-logo';
import type { SendEmailOptions, SendEmailResult, EmailLogEntry, EstateEmailSettings } from './types';

/**
 * Truncate text for preview (for notification history)
 */
function truncateForPreview(text: string, maxLength = 200): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Log email send attempt to database
 * Now also logs to notification_history for unified notification tracking
 */
async function logEmail(entry: EmailLogEntry): Promise<void> {
  try {
    const supabase = createAdminClient();

    // Log to legacy email_logs table
    await supabase.from('email_logs').insert({
      recipient_email: entry.recipientEmail,
      recipient_name: entry.recipientName || null,
      resident_id: entry.residentId || null,
      email_type: entry.emailType,
      subject: entry.subject,
      resend_id: entry.resendId || null,
      status: entry.status,
      error_message: entry.errorMessage || null,
      metadata: entry.metadata || null,
    });

    // Also log to notification_history for unified tracking
    // This bridges the legacy email system with the new notification system
    await supabase.from('notification_history').insert({
      queue_id: null, // Legacy emails don't go through queue
      template_id: null,
      schedule_id: null,
      recipient_id: entry.residentId || null,
      recipient_email: entry.recipientEmail,
      recipient_phone: null,
      channel: 'email',
      subject: entry.subject,
      body_preview: entry.emailType ? `[${entry.emailType}] Email sent via legacy system` : 'Email sent via legacy system',
      status: entry.status === 'sent' ? 'sent' : 'failed',
      external_id: entry.resendId || null,
      error_message: entry.errorMessage || null,
      metadata: {
        ...entry.metadata,
        legacy_email: true,
        email_type: entry.emailType,
        recipient_name: entry.recipientName,
      },
      sent_at: entry.status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (error) {
    // Fail silently - email logging should not break the main operation
    console.error('[Email] Failed to log email:', error);
  }
}

/**
 * Get estate settings for email templates
 */
export async function getEstateEmailSettings(): Promise<EstateEmailSettings> {
  // Service-role read: cron and webhook sends have no session, so the RLS-bound
  // `getSettings` would return no rows and every field would fall back (#1198).
  const settings = await getRawSettingsAsService(['estate_name', 'estate_email', 'estate_phone', 'estate_address', 'estate_website_url', 'estate_logo_url']);
  const value = (key: string) => {
    const raw = settings.status === 'ok' ? settings.values.get(key) : null;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  };

  return {
    estateName: value('estate_name') || 'Residio Estate',
    estateEmail: value('estate_email'),
    estatePhone: value('estate_phone'),
    estateAddress: value('estate_address'),
    estateWebsite: value('estate_website_url'),
    estateLogoUrl: usableEstateLogoUrl(settings.status === 'ok' ? settings.values.get('estate_logo_url') : null),
  };
}

/**
 * Send an email using Resend
 * Handles logging, settings checks, and error handling
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  // Service-role reads (see #136/#139): reached from the
  // process-report-schedules cron path (`processDueSchedules`), an
  // unauthenticated context where the RLS-bound `getSettingValue` always
  // returns null.
  // Check if email is globally enabled
  const emailEnabled = await getSettingValueAsService('email_enabled');
  if (emailEnabled === false) {
    return { success: false, error: 'Email notifications are disabled' };
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  // Check if Resend is configured
  const transportError = getEmailTransportError();
  if (transportError) {
    return { success: false, error: transportError };
  }

  const result = await sendViaResend(
    {
      to: recipients.map(r => r.email),
      subject: options.subject,
      react: options.react,
      attachments: options.attachments,
    },
    { residentOverride: options.residentOverride, purpose: options.purpose }
  );

  // Original and actual recipient (or the block) go into the log metadata (#715).
  const logMetadata = result.override
    ? { ...options.metadata, override: result.override }
    : options.metadata;
  const overrideField = result.override ? { override: result.override } : {};

  if (!result.ok) {
    // Log failed attempt for each recipient
    for (const recipient of recipients) {
      await logEmail({
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        residentId: recipient.residentId,
        emailType: options.emailType,
        subject: options.subject,
        status: 'failed',
        errorMessage: result.error,
        metadata: logMetadata,
      });
    }
    return { success: false, error: result.error, ...overrideField };
  }

  // Log successful send for each recipient
  for (const recipient of recipients) {
    await logEmail({
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      residentId: recipient.residentId,
      emailType: options.emailType,
      subject: options.subject,
      resendId: result.id,
      status: 'sent',
      metadata: logMetadata,
    });
  }

  return { success: true, resendId: result.id, ...overrideField };
}
