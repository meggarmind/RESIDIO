import { getActiveSmsProvider } from './provider';
import type { SmsProvider } from './providers/types';
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
} from './types';

/**
 * Log SMS send attempt to database
 * Logs to notification_history for unified notification tracking
 */
async function logSms(entry: SmsLogEntry, provider: SmsProvider): Promise<void> {
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
        provider: provider.name,
      },
      sent_at: entry.status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (error) {
    // Fail silently - logging should not break the main operation
    console.error('[SMS] Failed to log SMS:', error);
  }
}

/**
 * Send an SMS using the provider chosen in Settings -> Sending (Termii or HollaTags)
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

  // The chosen provider must have its credentials; there is no fallback to the other one (#1462).
  const provider = await getActiveSmsProvider();
  if (!provider.isConfigured()) {
    return { success: false, error: provider.missingConfigError };
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  // Communications override (#715): settings are read once; each recipient is
  // resolved separately so its own original number labels its own message.
  const snapshot = await loadSnapshotFor(options);

  // Send to each recipient (each provider call takes a single recipient)
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
    const result = await sendSingleSms(recipient, options, decision, envLabel, provider);
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
      ...(results[0]?.balance !== undefined ? { balance: results[0].balance } : {}),
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
  envLabel: string,
  provider: SmsProvider
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
      }, provider);
    }
    return { success: false, error: errorMessage, override };
  }

  const destination = decision.redirect ? decision.to : recipient.phone;
  const message = decision.redirect
    ? prefixText(envLabel, recipient.phone, options.message)
    : options.message;

  try {
    const sent = await provider.send({ to: destination, message });

    if (sent.success) {
      // Log successful send, unless the caller is writing its own history
      // row for this send (#401 -- see SendSmsOptions.skipHistoryLog).
      if (!options.skipHistoryLog) {
        await logSms({
          recipientPhone: recipient.phone,
          recipientName: recipient.name,
          residentId: recipient.residentId,
          smsType: options.smsType,
          message: options.message,
          messageId: sent.messageId,
          status: 'sent',
          metadata: {
            ...logMetadata,
            ...(sent.balance !== undefined ? { balance: sent.balance } : {}),
          },
        }, provider);
      }

      return {
        success: true,
        messageId: sent.messageId,
        ...(sent.balance !== undefined ? { balance: sent.balance } : {}),
        override,
      };
    }

    // The provider returned an error
    const errorMessage = sent.error || `Unknown ${provider.name} error`;

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
      }, provider);
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
      }, provider);
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
