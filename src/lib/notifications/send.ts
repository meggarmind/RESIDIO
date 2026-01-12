/**
 * Notification Sender - Channel Dispatcher Pattern
 *
 * Sends notifications through the appropriate channel (email, SMS, WhatsApp).
 * Currently only email is implemented; SMS/WhatsApp return not-implemented errors.
 *
 * Future-proofing: To add SMS/WhatsApp support:
 * 1. Create sendViaSms() / sendViaWhatsApp() functions
 * 2. Add the channel case to the dispatcher
 * 3. Update IMPLEMENTED_CHANNELS in types.ts
 */

import { resend, emailConfig, isEmailConfigured } from '@/lib/email/resend';
import { getSettingValue } from '@/actions/settings/get-settings';
import { createAdminClient } from '@/lib/supabase/server';
import type {
  NotificationChannel,
  NotificationQueueItem,
  SendNotificationResult,
  HistoryStatus,
} from './types';
import { isChannelImplemented } from './types';
import { truncateForPreview } from './templates';

/**
 * Channel-specific sender function signature
 */
type ChannelSender = (
  item: NotificationQueueItem
) => Promise<SendNotificationResult>;

/**
 * Send a notification via email using Resend
 */
async function sendViaEmail(
  item: NotificationQueueItem
): Promise<SendNotificationResult> {
  // Check if email is globally enabled
  const emailEnabled = await getSettingValue('email_enabled');
  if (emailEnabled === false) {
    return {
      success: false,
      error: 'Email notifications are disabled in system settings',
    };
  }

  // Check if Resend is configured
  if (!isEmailConfigured() || !resend) {
    return {
      success: false,
      error: 'Email service not configured (missing RESEND_API_KEY)',
    };
  }

  // Validate recipient email
  if (!item.recipient_email) {
    return {
      success: false,
      error: 'No recipient email address provided',
    };
  }

  try {
    // Get sender name from settings
    const fromName = (await getSettingValue('email_from_name')) || 'Residio Estate';

    // Send via Resend
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${emailConfig.fromAddress}>`,
      to: item.recipient_email,
      replyTo: emailConfig.replyTo,
      subject: item.subject || 'Notification',
      // Prefer HTML if available, otherwise use plain text
      ...(item.html_body
        ? { html: item.html_body }
        : { text: item.body }),
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      externalId: data?.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error sending email',
    };
  }
}

/**
 * Send a notification via SMS (NOT YET IMPLEMENTED)
 *
 * To implement SMS:
 * 1. Add SMS gateway integration (e.g., Twilio, Africa's Talking)
 * 2. Implement this function
 * 3. Add 'sms' to IMPLEMENTED_CHANNELS in types.ts
 */
async function sendViaSms(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _item: NotificationQueueItem
): Promise<SendNotificationResult> {
  return {
    success: false,
    error: 'SMS notifications are not yet implemented. Coming soon!',
  };
}

/**
 * Send a notification via WhatsApp (NOT YET IMPLEMENTED)
 *
 * To implement WhatsApp:
 * 1. Add WhatsApp Business API integration
 * 2. Implement this function
 * 3. Add 'whatsapp' to IMPLEMENTED_CHANNELS in types.ts
 */
async function sendViaWhatsApp(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _item: NotificationQueueItem
): Promise<SendNotificationResult> {
  return {
    success: false,
    error: 'WhatsApp notifications are not yet implemented. Coming soon!',
  };
}

/**
 * Channel dispatcher map
 */
const CHANNEL_SENDERS: Record<NotificationChannel, ChannelSender> = {
  email: sendViaEmail,
  sms: sendViaSms,
  whatsapp: sendViaWhatsApp,
};

/**
 * Send a notification through the appropriate channel
 *
 * This is the main entry point for sending notifications.
 * It dispatches to the channel-specific sender.
 */
export async function sendNotification(
  item: NotificationQueueItem
): Promise<SendNotificationResult> {
  const channel = item.channel;

  // Check if channel is implemented
  if (!isChannelImplemented(channel)) {
    return {
      success: false,
      error: `Channel '${channel}' is not yet implemented`,
    };
  }

  // Get the appropriate sender
  const sender = CHANNEL_SENDERS[channel];
  if (!sender) {
    return {
      success: false,
      error: `No sender configured for channel '${channel}'`,
    };
  }

  // Send via the channel
  return sender(item);
}

/**
 * Send a notification and record it to history
 *
 * This function:
 * 1. Sends the notification via the appropriate channel
 * 2. Creates a history record
 * 3. Updates the queue item status
 */
export async function sendAndRecordNotification(
  item: NotificationQueueItem
): Promise<SendNotificationResult> {
  const supabase = createAdminClient();

  // Send the notification
  const result = await sendNotification(item);

  // Determine history status
  const historyStatus: HistoryStatus = result.success ? 'sent' : 'failed';

  // Create history record
  const { data: historyEntry, error: historyError } = await supabase
    .from('notification_history')
    .insert({
      queue_id: item.id,
      template_id: item.template_id,
      schedule_id: item.schedule_id,
      recipient_id: item.recipient_id,
      recipient_email: item.recipient_email,
      recipient_phone: item.recipient_phone,
      channel: item.channel,
      subject: item.subject,
      body_preview: truncateForPreview(item.body),
      status: historyStatus,
      external_id: result.externalId || null,
      error_message: result.error || null,
      metadata: {
        ...item.metadata,
        deduplication_key: item.deduplication_key,
        queue_priority: item.priority,
        queue_attempts: item.attempts + 1,
      },
      sent_at: result.success ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (historyError) {
    console.error('[Notifications] Failed to create history record:', historyError);
  }

  // Update queue item status
  const queueUpdateStatus = result.success ? 'sent' : 'failed';
  const { error: queueError } = await supabase
    .from('notification_queue')
    .update({
      status: queueUpdateStatus,
      attempts: item.attempts + 1,
      last_attempt_at: new Date().toISOString(),
      sent_at: result.success ? new Date().toISOString() : null,
      error_message: result.error || null,
    })
    .eq('id', item.id);

  if (queueError) {
    console.error('[Notifications] Failed to update queue item:', queueError);
  }

  return {
    ...result,
    historyId: historyEntry?.id,
  };
}

/**
 * Send an immediate notification (bypassing queue)
 *
 * Use this for urgent notifications that shouldn't wait in the queue.
 * Still creates a history record for tracking.
 */
export async function sendImmediate(params: {
  recipientId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  htmlBody?: string;
  metadata?: Record<string, unknown>;
}): Promise<SendNotificationResult> {
  const supabase = createAdminClient();

  // Check if channel is implemented
  if (!isChannelImplemented(params.channel)) {
    return {
      success: false,
      error: `Channel '${params.channel}' is not yet implemented`,
    };
  }

  // Create a pseudo queue item for the sender
  const pseudoItem: NotificationQueueItem = {
    id: 'immediate',
    template_id: null,
    schedule_id: null,
    recipient_id: params.recipientId,
    recipient_email: params.recipientEmail || null,
    recipient_phone: params.recipientPhone || null,
    channel: params.channel,
    subject: params.subject || null,
    body: params.body,
    html_body: params.htmlBody || null,
    variables: null,
    priority: 1, // Highest priority
    status: 'processing',
    deduplication_key: null,
    dedup_window_minutes: null,
    scheduled_for: new Date().toISOString(),
    attempts: 0,
    max_attempts: 1,
    last_attempt_at: null,
    sent_at: null,
    error_message: null,
    metadata: params.metadata || null,
    created_at: new Date().toISOString(),
    created_by: null,
  };

  // Send the notification
  const result = await sendNotification(pseudoItem);

  // Create history record for tracking
  const historyStatus: HistoryStatus = result.success ? 'sent' : 'failed';
  const { data: historyEntry, error: historyError } = await supabase
    .from('notification_history')
    .insert({
      queue_id: null, // No queue entry for immediate sends
      template_id: null,
      schedule_id: null,
      recipient_id: params.recipientId,
      recipient_email: params.recipientEmail,
      recipient_phone: params.recipientPhone,
      channel: params.channel,
      subject: params.subject,
      body_preview: truncateForPreview(params.body),
      status: historyStatus,
      external_id: result.externalId || null,
      error_message: result.error || null,
      metadata: {
        ...params.metadata,
        immediate: true,
      },
      sent_at: result.success ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (historyError) {
    console.error('[Notifications] Failed to create history record for immediate send:', historyError);
  }

  return {
    ...result,
    historyId: historyEntry?.id,
  };
}
