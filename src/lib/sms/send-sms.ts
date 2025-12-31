'use server';

import { termiiConfig, isSmsConfigured, formatPhoneForTermii } from './termii';
import { createAdminClient } from '@/lib/supabase/server';
import { getSettingValue } from '@/actions/settings/get-settings';
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
  // Check if SMS is globally enabled
  const smsEnabled = await getSettingValue('sms_enabled');
  if (smsEnabled === false) {
    return { success: false, error: 'SMS notifications are disabled' };
  }

  // Check if Termii is configured
  if (!isSmsConfigured()) {
    return { success: false, error: 'SMS service not configured (missing TERMII_API_KEY)' };
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  // Send to each recipient (Termii API handles single recipient per request)
  const results: SendSmsResult[] = [];

  for (const recipient of recipients) {
    const result = await sendSingleSms(recipient, options);
    results.push(result);
  }

  // Return combined result
  const allSuccess = results.every((r) => r.success);
  const errors = results.filter((r) => !r.success).map((r) => r.error);

  if (allSuccess) {
    return {
      success: true,
      messageId: results[0]?.messageId,
      balance: results[0]?.balance,
    };
  }

  return {
    success: false,
    error: errors.join('; '),
  };
}

/**
 * Send SMS to a single recipient
 */
async function sendSingleSms(
  recipient: { phone: string; name?: string; residentId?: string },
  options: SendSmsOptions
): Promise<SendSmsResult> {
  const formattedPhone = formatPhoneForTermii(recipient.phone);

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
        sms: options.message,
        type: 'plain',
        channel: 'generic', // Can be 'generic', 'dnd' (Do Not Disturb), or 'whatsapp'
      }),
    });

    const data: TermiiSendResponse = await response.json();

    if (data.code === 'ok') {
      // Log successful send
      await logSms({
        recipientPhone: recipient.phone,
        recipientName: recipient.name,
        residentId: recipient.residentId,
        smsType: options.smsType,
        message: options.message,
        messageId: data.message_id_str || data.message_id,
        status: 'sent',
        metadata: {
          ...options.metadata,
          balance: data.balance,
        },
      });

      return {
        success: true,
        messageId: data.message_id_str || data.message_id,
        balance: data.balance,
      };
    }

    // API returned an error
    const errorMessage = data.message || 'Unknown Termii API error';

    await logSms({
      recipientPhone: recipient.phone,
      recipientName: recipient.name,
      residentId: recipient.residentId,
      smsType: options.smsType,
      message: options.message,
      status: 'failed',
      errorMessage,
      metadata: options.metadata,
    });

    return { success: false, error: errorMessage };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error sending SMS';

    await logSms({
      recipientPhone: recipient.phone,
      recipientName: recipient.name,
      residentId: recipient.residentId,
      smsType: options.smsType,
      message: options.message,
      status: 'failed',
      errorMessage,
      metadata: options.metadata,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Send OTP verification SMS
 * Convenience function for sending verification codes
 */
export async function sendVerificationSms(
  phone: string,
  otp: string,
  residentId?: string
): Promise<SendSmsResult> {
  const message = `Your Residio verification code is: ${otp}. Valid for 30 minutes. Do not share this code with anyone.`;

  return sendSms({
    to: { phone, residentId },
    message,
    smsType: 'verification',
    metadata: { purpose: 'phone_verification' },
  });
}
