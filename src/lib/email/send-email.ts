'use server';

import { resend, emailConfig, isEmailConfigured } from './resend';
import { createAdminClient } from '@/lib/supabase/server';
import { getSettingValue, getSettings } from '@/actions/settings/get-settings';
import type { SendEmailOptions, SendEmailResult, EmailLogEntry, EstateEmailSettings } from './types';

/**
 * Log email send attempt to database
 */
async function logEmail(entry: EmailLogEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
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
  } catch (error) {
    // Fail silently - email logging should not break the main operation
    console.error('[Email] Failed to log email:', error);
  }
}

/**
 * Get estate settings for email templates
 */
export async function getEstateEmailSettings(): Promise<EstateEmailSettings> {
  const { data: settings } = await getSettings('general');

  const settingsMap = settings?.reduce((acc, s) => {
    acc[s.key] = s.value;
    return acc;
  }, {} as Record<string, unknown>) || {};

  return {
    estateName: (settingsMap.estate_name as string) || 'Residio Estate',
    estateEmail: settingsMap.estate_email as string | undefined,
    estatePhone: settingsMap.estate_phone as string | undefined,
    estateAddress: settingsMap.estate_address as string | undefined,
    estateWebsite: settingsMap.estate_website as string | undefined,
  };
}

/**
 * Send an email using Resend
 * Handles logging, settings checks, and error handling
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  // Check if email is globally enabled
  const emailEnabled = await getSettingValue('email_enabled');
  if (emailEnabled === false) {
    return { success: false, error: 'Email notifications are disabled' };
  }

  // Check if Resend is configured
  if (!isEmailConfigured() || !resend) {
    return { success: false, error: 'Email service not configured (missing RESEND_API_KEY)' };
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  // Get sender name from settings
  const fromName = (await getSettingValue('email_from_name')) || 'Residio Estate';

  try {
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${emailConfig.fromAddress}>`,
      to: recipients.map(r => r.email),
      replyTo: emailConfig.replyTo,
      subject: options.subject,
      react: options.react,
    });

    if (error) {
      // Log failed attempt for each recipient
      for (const recipient of recipients) {
        await logEmail({
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          residentId: recipient.residentId,
          emailType: options.emailType,
          subject: options.subject,
          status: 'failed',
          errorMessage: error.message,
          metadata: options.metadata,
        });
      }
      return { success: false, error: error.message };
    }

    // Log successful send for each recipient
    for (const recipient of recipients) {
      await logEmail({
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        residentId: recipient.residentId,
        emailType: options.emailType,
        subject: options.subject,
        resendId: data?.id,
        status: 'sent',
        metadata: options.metadata,
      });
    }

    return { success: true, resendId: data?.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error sending email';

    // Log failed attempt
    for (const recipient of recipients) {
      await logEmail({
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        residentId: recipient.residentId,
        emailType: options.emailType,
        subject: options.subject,
        status: 'failed',
        errorMessage,
        metadata: options.metadata,
      });
    }

    return { success: false, error: errorMessage };
  }
}
