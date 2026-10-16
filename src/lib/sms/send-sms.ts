import { termiiConfig, isSmsConfigured, formatPhoneForTermii } from './termii';
import { createAdminClient } from '@/lib/supabase/server';
import { getSettingValueAsService } from '@/lib/settings/service';
import { decideSend, loadSnapshotFor } from '@/lib/comms-override/gate';
import { prefixText } from '@/lib/comms-override/labels';
import { blockedError, toLogRecord } from '@/lib/comms-override/resolver';
import type { CommsSendContext, ResolveResult } from '@/lib/comms-override/types';
import type {
  SendSmsOptions,
  SendSmsResult,
  SmsLogEntry,
  TermiiSendResponse,
} from './types';

/**
 * Log SMS send attempt to database
 * Logs to notification_history for unified notification tracking
 */
async function logSms(entry: SmsLogEntry): Promise<void> {
  try {
    const supabase = createAdminClient();

    // Log to notification_history for unified tracking
    await supabase.from('notification_history').insert({
      queue_id: null,
      template_id: null,
      schedule_id: null,
      recipient_id: entry.residentId || null,
      recipient_email: null,
      recipient_phone: entry.recipientPhone,
      channel: 'sms',
      subject: null,
      body_preview: entry.message.substring(0, 200),
      status: entry.status === 'sent' ? 'sent' : 'failed',
      external_id: entry.messageId || null,
      error_message: entry.errorMessage || null,
      metadata: {
        ...entry.metadata,
        sms_type: entry.smsType,
        recipient_name: entry.recipientName,
        provider: 'termii',
      },
      sent_at: entry.status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (error) {
    // Fail silently - logging should not break the main operation
    console.error('[SMS] Failed to log SMS:', error);
  }
}

/**
 * Send an SMS using Termii
 * Handles logging, settings checks, and error handling
 */
export async function sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
  // Service-role read (see #136/#139): reached from the payment-reminders
  // cron path (`processInvoiceReminders` -> `sendSmsReminder`), an
  // unauthenticated context where the RLS-bound `getSettingValue` always
  // returns null.
  // Check if SMS is globally enabled
  const smsEnabled = await getSettingValueAsService('sms_enabled');
  if (smsEnabled === false) {
    return { success: false, error: 'SMS notifications are disabled' };
  }

  // Check if Termii is configured
  if (!isSmsConfigured()) {
    return { success: false, error: 'SMS service not configured (missing TERMII_API_KEY)' };
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  // Communications override (#715): settings are read once; each recipient is
  // resolved separately so its own original number labels its own message.
  const snapshot = await loadSnapshotFor(options);

  // Send to each recipient (Termii API handles single recipient per request)
  const results: SendSmsResult[] = [];

  for (const recipient of recipients) {
    const { result: decision, envLabel } = await decideSend(
      {
        channel: 'sms',
        original: recipient.phone,
        residentOverride: options.residentOverride,
        purpose: options.purpose,
      },
      snapshot
    );
    const result = await sendSingleSms(recipient, options, decision, envLabel);
    results.push(result);
  }

  // Return combined result
  const allSuccess = results.every((r) => r.success);
  const errors = results.filter((r) => !r.success).map((r) => r.error);
  const override = results.find((r) => r.override)?.override;

  if (allSuccess) {
    return {
      success: true,
      messageId: results[0]?.messageId,
      balance: results[0]?.balance,
      ...(override ? { override } : {}),
    };
  }

  return {
    success: false,
    error: errors.join('; '),
    ...(override ? { override } : {}),
  };
}

/**
 * Send SMS to a single recipient
 */
async function sendSingleSms(
  recipient: { phone: string; name?: string; residentId?: string },
  options: SendSmsOptions,
  decision: ResolveResult,
  envLabel: string
): Promise<SendSmsResult> {
  const override = toLogRecord(decision) ?? undefined;
  const logMetadata = override ? { ...options.metadata, override } : options.metadata;

  // Blocked: never fall through to the real number (#715).
  if ('blocked' in decision) {
    const errorMessage = blockedError(decision);
    if (!options.skipHistoryLog) {
      await logSms({
        recipientPhone: recipient.phone,
        recipientName: recipient.name,
        residentId: recipient.residentId,
        smsType: options.smsType,
        message: options.message,
        status: 'failed',
        errorMessage,
        metadata: logMetadata,
      });
    }
    return { success: false, error: errorMessage, override };
  }

  const destination = decision.redirect ? decision.to : recipient.phone;
  const message = decision.redirect
    ? prefixText(envLabel, recipient.phone, options.message)
    : options.message;
  const formattedPhone = formatPhoneForTermii(destination);

  try {
    const response = await fetch(`${termiiConfig.baseUrl}/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: termiiConfig.apiKey,
        to: formattedPhone,
        from: termiiConfig.senderId,
        sms: message,
        type: 'plain',
        channel: 'generic', // Can be 'generic', 'dnd' (Do Not Disturb), or 'whatsapp'
      }),
    });

    const data: TermiiSendResponse = await response.json();

    if (data.code === 'ok') {
      // Log successful send, unless the caller is writing its own history
      // row for this send (#401 -- see SendSmsOptions.skipHistoryLog).
      if (!options.skipHistoryLog) {
        await logSms({
          recipientPhone: recipient.phone,
          recipientName: recipient.name,
          residentId: recipient.residentId,
          smsType: options.smsType,
          message: options.message,
          messageId: data.message_id_str || data.message_id,
          status: 'sent',
          metadata: {
            ...logMetadata,
            balance: data.balance,
          },
        });
      }

      return {
        success: true,
        messageId: data.message_id_str || data.message_id,
        balance: data.balance,
        override,
      };
    }

    // API returned an error
    const errorMessage = data.message || 'Unknown Termii API error';

    if (!options.skipHistoryLog) {
      await logSms({
        recipientPhone: recipient.phone,
        recipientName: recipient.name,
        residentId: recipient.residentId,
        smsType: options.smsType,
        message: options.message,
        status: 'failed',
        errorMessage,
        metadata: logMetadata,
      });
    }

    return { success: false, error: errorMessage, override };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error sending SMS';

    if (!options.skipHistoryLog) {
      await logSms({
        recipientPhone: recipient.phone,
        recipientName: recipient.name,
        residentId: recipient.residentId,
        smsType: options.smsType,
        message: options.message,
        status: 'failed',
        errorMessage,
        metadata: logMetadata,
      });
    }

    return { success: false, error: errorMessage, override };
  }
}

/**
 * Send OTP verification SMS
 * Convenience function for sending verification codes
 */
export async function sendVerificationSms(
  phone: string,
  otp: string,
  residentId?: string,
  context?: CommsSendContext
): Promise<SendSmsResult> {
  const message = `Your Residio verification code is: ${otp}. Valid for 30 minutes. Do not share this code with anyone.`;

  return sendSms({
    to: { phone, residentId },
    message,
    smsType: 'verification',
    metadata: { purpose: 'phone_verification' },
    ...context,
  });
}
