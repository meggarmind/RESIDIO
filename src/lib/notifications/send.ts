/**
 * Notification Sender - Channel Dispatcher Pattern
 *
 * Sends notifications through the appropriate channel (email, WhatsApp).
 * `sms` is not a directly queueable channel (see `IMPLEMENTED_CHANNELS`);
 * WhatsApp enforces approved template-only sends for proactive delivery,
 * against whichever provider (Meta, Twilio, Chatmaid) is currently active.
 *
 * The one exception: when the active provider is Chatmaid and a WhatsApp
 * send fails on a URGENT-priority item, `sendViaWhatsApp` falls back to
 * Termii SMS (#401 owner decision) rather than leaving the queue to retry a
 * bridge that may be down with no recovery path. This is scoped to URGENT
 * only and to Chatmaid only -- Meta/Twilio behaviour is unchanged.
 *
 * Provider-specific senders stay behind this dispatcher so queue/history
 * behavior remains shared across channels.
 */

import { getEmailTransportError, sendViaResend } from '@/lib/email/transport';
import { getSettingValueAsService } from '@/lib/settings/service';
import { createAdminClient } from '@/lib/supabase/server';
import type {
  NotificationChannel,
  NotificationQueueItem,
  SendNotificationResult,
  HistoryStatus,
} from './types';
import { isChannelImplemented } from './types';
import { truncateForPreview } from './templates';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { resolveWhatsAppConfig } from '@/lib/whatsapp/config';
import { evaluateSendPolicy, createSendPolicyFacts } from '@/lib/whatsapp/send-policy';
import { sendSms } from '@/lib/sms/send-sms';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import type { CommsSendContext } from '@/lib/comms-override/types';
import { PRIORITY } from '@/lib/notifications/queue';
import { nextUtcMidnight, resolveBurstWindowMinutes, retryDelayMs } from './retry';

/** `sendImmediate` builds a pseudo queue item with this id; it has no queue row. */
const IMMEDIATE_ITEM_ID = 'immediate';

/**
 * Channel-specific sender function signature
 */
type ChannelSender = (
  item: NotificationQueueItem,
  context?: CommsSendContext
) => Promise<SendNotificationResult>;

/**
 * Send a notification via email using Resend
 */
async function sendViaEmail(
  item: NotificationQueueItem,
  context?: CommsSendContext
): Promise<SendNotificationResult> {
  // Check if email is globally enabled. This runs from cron/queue processing
  // with no authenticated user, so it must read via the service-role client
  // (see #136) — the RLS-bound getSettingValue would silently return null
  // here and this fail-open comparison would let cron email through anyway.
  // NOTE: `=== false` fails OPEN on null/absent/error; making this fail
  // closed is tracked separately in #134 and must not be bundled here.
  const emailEnabled = await getSettingValueAsService('email_enabled');
  if (emailEnabled === false) {
    return {
      success: false,
      error: 'Email notifications are disabled in system settings',
    };
  }

  // Check if Resend is configured
  const transportError = getEmailTransportError();
  if (transportError) {
    return {
      success: false,
      error: transportError,
    };
  }

  // Validate recipient email
  if (!item.recipient_email) {
    return {
      success: false,
      error: 'No recipient email address provided',
    };
  }

  // One key per queue item and attempt, so a retry after a timeout whose first request
  // actually landed cannot send the email twice (#546). Communications override (#716): the
  // resident's flag, looked up by the caller.
  const transportOptions = {
    ...(item.id === IMMEDIATE_ITEM_ID ? {} : { idempotencyKey: `${item.id}:${item.attempts + 1}` }),
    ...(context?.residentOverride !== undefined ? { residentOverride: context.residentOverride } : {}),
  };

  try {
    // A WhatsApp statement request (#804) is rendered at send time, with its PDF attached.
    // Imported lazily: it pulls in the PDF renderer, which nothing else here needs.
    const statementRequestId = item.metadata?.whatsapp_statement_request_id;
    const statement = typeof statementRequestId === 'string'
      ? await (await import('@/lib/whatsapp/statement-delivery')).buildStatementEmail(statementRequestId)
      : null;
    const result = await sendViaResend(
      {
        to: item.recipient_email,
        subject: item.subject || 'Notification',
        // Prefer HTML if available, otherwise use plain text
        ...(statement
          ? statement
          : item.html_body
            ? { html: item.html_body }
            : { text: item.body }),
      },
      transportOptions
    );

    // Communications override (#715): original and actual recipient (or the
    // block) land in the history row's metadata via `result.metadata`.
    const overrideMetadata = result.override ? { metadata: { override: result.override } } : {};

    if (!result.ok) {
      return {
        success: false,
        error: result.error,
        ...(result.retryable ? { retryable: true } : {}),
        ...overrideMetadata,
      };
    }

    if (typeof statementRequestId === 'string') {
      // The email is out, so a failed status update must not fail the send: a retry would send it twice.
      try {
        await (await import('@/lib/whatsapp/statement-delivery')).markStatementEmailSent(statementRequestId);
      } catch (error) {
        console.error('[notifications] Statement request could not be marked sent:', { statementRequestId, error });
      }
    }

    return {
      success: true,
      externalId: result.id,
      ...overrideMetadata,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error sending email',
      retryable: true,
    };
  }
}

/**
 * Send a notification via SMS. SMS is not operational; this sender
 * exists so the dispatcher map stays complete but calls are caught
 * early by the isChannelImplemented guard before reaching here.
 */
async function sendViaSms(
  _item: NotificationQueueItem
): Promise<SendNotificationResult> {
  return {
    success: false,
    error: 'SMS is not implemented',
  };
}

/**
 * Send a notification via WhatsApp. Only approved template sends are allowed
 * for proactive delivery; free-form text is rejected.
 */
async function sendViaWhatsApp(
  item: NotificationQueueItem,
  context?: CommsSendContext
): Promise<SendNotificationResult> {
  // Pre-send checks (kill switch, rollout, caps, opt-in, template) live in the
  // Send Policy module; anything other than 'allow' stops here.
  const decision = await evaluateSendPolicy(
    {
      recipientId: item.recipient_id,
      recipientPhone: item.recipient_phone,
      metadata: item.metadata,
    },
    createSendPolicyFacts()
  );
  if (decision.outcome === 'defer') {
    // Note: a deferred send still consumes one attempt, so 5 consecutive capped
    // UTC days (or a long burst backlog) exhaust max_attempts and fail the row.
    // A cap is transient: try again when it can have cleared (#546).
    return {
      success: false,
      error: decision.message,
      retryable: true,
      retryAt: (await resolveDeferRetryAt(decision.reason)).toISOString(),
    };
  }
  if (decision.outcome !== 'allow') {
    // `refuse` is a policy verdict (kill switch, rollout, consent, template,
    // zero cap, unverifiable state): retrying cannot change it.
    return { success: false, error: decision.message };
  }

  const templateMessage = {
    to: decision.normalizedPhone,
    templateName: decision.template.name,
    languageCode: decision.template.languageCode,
    parameters: decision.template.parameters,
    // Chatmaid dedupes on content; the queue id keeps a repeat notice a distinct send (#842).
    ...(item.id === IMMEDIATE_ITEM_ID ? {} : { idempotencySeed: item.id }),
  };
  // Communications override (#716): forward the resident's flag when the caller looked it up.
  const result = await sendWhatsAppTemplate(templateMessage, undefined, context, {
    purpose: 'notification',
    residentId: item.recipient_id,
    ...(item.id === IMMEDIATE_ITEM_ID ? {} : { notificationQueueId: item.id }),
  });

  if (!result.success) {
    // DORMANT while SMS is off (owner decision 2026-10-13): the fallback is
    // additionally gated on isChannelImplemented('sms'), so it never calls
    // sendSms and the WhatsApp failure is returned unchanged. It wakes up when
    // 'sms' is added back to IMPLEMENTED_CHANNELS. The 2026-10-07 decision to
    // revisit this trigger before Termii is connected still applies.
    //
    // SMS fallback (owner decision, #401): covers URGENT-priority sends only
    // (announcements today), and only when the active provider is Chatmaid --
    // a bridge with no delivery guarantee and no recovery path for a message
    // that never arrived (issue #401 §3). Invoice reminders and payment
    // receipts (NORMAL priority) are left to fail here so the queue retries
    // them; this must not change Meta/Twilio behaviour at all, so it only
    // fires after the normal WhatsApp send has already failed.
    const shouldConsiderSmsFallback =
      item.priority === PRIORITY.URGENT && isChannelImplemented('sms');
    if (shouldConsiderSmsFallback) {
      const resolved = await resolveWhatsAppConfig();
      const activeProviderIsChatmaid = resolved.status === 'ok' && resolved.config.provider === 'chatmaid';

      if (activeProviderIsChatmaid) {
        const smsResult = await sendSms({
          to: { phone: item.recipient_phone as string, residentId: item.recipient_id },
          message: item.body,
          smsType: 'notification',
          metadata: {
            fallbackReason: 'whatsapp_chatmaid_send_failed',
            whatsappError: result.error,
          },
          // sendAndRecordNotification writes the single history row for
          // this send (channel 'sms', linked to the queue item) when it
          // sees `metadata.deliveredVia === 'sms_fallback'` below --
          // sendSms's own logSms() would otherwise write a second, orphaned
          // (queue_id: null) row, and the queue item's row would separately
          // record a Chatmaid failure as a successful WhatsApp send (#401
          // QA defect).
          skipHistoryLog: true,
          ...(context?.residentOverride !== undefined ? { residentOverride: context.residentOverride } : {}),
        });

        if (smsResult.success) {
          return {
            success: true,
            externalId: smsResult.messageId,
            // No `error` on a successful send -- the delivery channel is
            // recorded in `metadata` so history/queue callers (and anyone
            // reading `notification_history.metadata`) can tell this went
            // out over SMS rather than WhatsApp.
            metadata: {
              deliveredVia: 'sms_fallback',
              whatsappError: result.error,
              ...(smsResult.override ? { override: smsResult.override } : {}),
            },
          };
        }

        return {
          success: false,
          error: `WhatsApp send failed (${result.error}); SMS fallback also failed: ${smsResult.error}`,
        };
      }
    }
  }

  return {
    success: result.success,
    externalId: result.messageId,
    error: result.error,
    // Communications override (#715): original and actual recipient, or the block.
    ...(result.override ? { metadata: { override: result.override } } : {}),
    // Providers that cannot tell leave `retryable` unset, which for a
    // transport failure means transient (#546).
    ...(!result.success && (result.retryable ?? true) ? { retryable: true } : {}),
  };
}

/** When a Send Policy `defer` should be retried: next UTC midnight for the daily cap, one burst window for the burst cap. */
async function resolveDeferRetryAt(reason: string): Promise<Date> {
  const now = new Date();
  if (reason === 'burst_limit_reached') {
    const windowMinutes = resolveBurstWindowMinutes(
      await getSettingValueAsService('whatsapp_outbound_burst_window_minutes')
    );
    return new Date(now.getTime() + windowMinutes * 60 * 1000);
  }
  return nextUtcMidnight(now);
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
  item: NotificationQueueItem,
  /**
   * Communications override (#716): the resident's flag. Omitted means "no resident context",
   * which follows the global switch, so production senders go through `sendAndRecordNotification`
   * / `sendImmediate`, which look the flag up first.
   */
  context?: CommsSendContext
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
  return sender(item, context);
}

/**
 * Looks the queue row's resident flag up and sends. Fails closed: if the flag cannot be read the
 * message is NOT sent (never sent as if the flag were null), and the failure is retryable because
 * an unreadable table is transient.
 */
async function sendWithResidentFlag(item: NotificationQueueItem): Promise<SendNotificationResult> {
  const override = item.recipient_id
    ? await resolveResidentOverride([item.recipient_id])
    : ({ ok: false, error: 'comms override: queue row has no resident to read the flag for' } as const);
  if (!override.ok) {
    return { success: false, error: override.error, retryable: true };
  }
  return sendNotification(item, { residentOverride: override.residentOverride });
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
  const result = await sendWithResidentFlag(item);

  // Determine history status
  const historyStatus: HistoryStatus = result.success ? 'sent' : 'failed';

  // A transient failure with attempts left goes back to 'pending' for a later
  // run instead of ending as 'failed' (#546). The attempt's own history row is
  // still written as 'failed'. Unclassified failures are NOT retryable.
  const attemptNumber = item.attempts + 1;
  const willRetry =
    !result.success && result.retryable === true && attemptNumber < item.max_attempts;
  const retryAt = willRetry
    ? result.retryAt ?? new Date(Date.now() + retryDelayMs(attemptNumber)).toISOString()
    : null;

  // The Chatmaid WhatsApp -> SMS fallback (#401) delivers over a different
  // channel than the queue item was written for. `sendViaWhatsApp` marks
  // that with `metadata.deliveredVia`; when it's set, this is the ONE
  // history row for this send -- `sendSms` was called with
  // `skipHistoryLog: true` specifically so it would not also write one --
  // and it must say 'sms', not the queue item's 'whatsapp', or a Chatmaid
  // failure reads back as a successful WhatsApp send (QA defect on #401).
  const isSmsFallback = result.metadata?.deliveredVia === 'sms_fallback';
  const historyChannel = isSmsFallback ? 'sms' : item.channel;

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
      channel: historyChannel,
      subject: item.subject,
      body_preview: truncateForPreview(item.body),
      status: historyStatus,
      external_id: result.externalId || null,
      error_message: result.error || null,
      metadata: {
        ...item.metadata,
        ...result.metadata,
        ...(isSmsFallback ? { fallback_from: 'whatsapp' } : {}),
        deduplication_key: item.deduplication_key,
        queue_priority: item.priority,
        queue_attempts: item.attempts + 1,
        ...(willRetry ? { will_retry: true, retry_at: retryAt } : {}),
      },
      sent_at: result.success ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (historyError) {
    console.error('[Notifications] Failed to create history record:', historyError);
  }

  // Update queue item status
  const queueUpdateStatus = result.success ? 'sent' : willRetry ? 'pending' : 'failed';
  const { error: queueError } = await supabase
    .from('notification_queue')
    .update({
      status: queueUpdateStatus,
      attempts: item.attempts + 1,
      last_attempt_at: new Date().toISOString(),
      sent_at: result.success ? new Date().toISOString() : null,
      error_message: result.error || null,
      ...(retryAt ? { scheduled_for: retryAt } : {}),
    })
    .eq('id', item.id);

  if (queueError) {
    console.error('[Notifications] Failed to update queue item:', queueError);
  }

  const candidateId = item.metadata && typeof item.metadata.candidateId === 'string'
    ? item.metadata.candidateId
    : null;
  if (candidateId) {
    const { error: candidateError } = await supabase
      .from('invoice_generation_candidates')
      // invoice_generation_candidates has no 'pending'; 'queued' is its
      // equivalent, and a requeued item is still waiting to be sent.
      .update({ email_status: willRetry ? 'queued' : queueUpdateStatus })
      .eq('id', candidateId);
    if (candidateError) {
      console.error('[Notifications] Failed to update invoice email status:', candidateError);
    }
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
  const result = await sendWithResidentFlag(pseudoItem);

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
