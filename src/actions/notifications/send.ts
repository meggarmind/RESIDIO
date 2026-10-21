'use server';

/**
 * Server Actions for Sending Notifications
 *
 * Queue and send notifications to residents.
 */

import { createAdminClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import {
  sendImmediate,
  renderTemplate,
  shouldSendToResident,
  addToQueue,
  PRIORITY,
} from '@/lib/notifications';
import { getTemplate } from './templates';
import type {
  NotificationCategory,
  NotificationChannel,
  SendNotificationResult,
} from '@/lib/notifications/types';


/**
 * Send a direct notification (no template)
 */
export async function sendDirectNotification(params: {
  recipientId: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  htmlBody?: string;
  category?: NotificationCategory;
}): Promise<SendNotificationResult & { error?: string }> {
  const { recipientId, channel, subject, body, htmlBody, category } = params;

  // Check preferences if category provided
  if (category) {
    const prefCheck = await shouldSendToResident({
      residentId: recipientId,
      category,
      channel,
    });

    if (!prefCheck.shouldSend) {
      return { success: false, error: prefCheck.reason || 'Blocked by preferences' };
    }
  }

  // Get recipient details
  const supabase = createAdminClient();
  const { data: recipient, error: recipientError } = await supabase
    .from('residents')
    .select('id, email, phone_primary, first_name, last_name')
    .eq('id', recipientId)
    .single();

  if (recipientError || !recipient) {
    return { success: false, error: 'Recipient not found' };
  }

  // Send immediately
  const result = await sendImmediate({
    recipientId,
    recipientEmail: recipient.email || undefined,
    recipientPhone: recipient.phone_primary,
    channel,
    subject,
    body,
    htmlBody,
    metadata: { direct: true, category },
  });

  // Audit log
  // audit_logs.entity_id is a uuid, so with no real id there is nothing to audit against (#594): a send that left no history row is not audited.
  if (result.historyId) {
    await logAudit({
      action: result.success ? 'CREATE' : 'REJECT',
      entityType: 'notification_history',
      entityId: result.historyId,
      entityDisplay: `Direct ${channel} to ${recipient.first_name} ${recipient.last_name}`,
      newValues: {
        recipientId,
        channel,
        subject,
        success: result.success,
      },
    });
  }

  return result;
}

/**
 * Send notification to multiple recipients
 */
export async function sendBulkNotification(params: {
  templateId: string;
  recipientIds: string[];
  variables: Record<string, unknown>;
  immediate?: boolean;
  priority?: number;
}): Promise<{
  success: boolean;
  sent: number;
  queued: number;
  failed: number;
  errors: string[];
}> {
  const { templateId, recipientIds, variables, immediate = false, priority = PRIORITY.NORMAL } = params;

  // Get template
  const { data: template, error: templateError } = await getTemplate(templateId);
  if (templateError || !template) {
    return {
      success: false,
      sent: 0,
      queued: 0,
      failed: recipientIds.length,
      errors: [templateError || 'Template not found'],
    };
  }

  const results = {
    success: true,
    sent: 0,
    queued: 0,
    failed: 0,
    errors: [] as string[],
  };
  // Ids of the history rows (immediate) or queue rows (queued) this call produced.
  const affectedIds: string[] = [];

  // Get all recipients
  const supabase = createAdminClient();
  const { data: recipients, error: recipientsError } = await supabase
    .from('residents')
    .select('id, email, phone_primary, first_name, last_name')
    .in('id', recipientIds);

  if (recipientsError || !recipients) {
    return {
      success: false,
      sent: 0,
      queued: 0,
      failed: recipientIds.length,
      errors: ['Failed to fetch recipients'],
    };
  }

  // Process each recipient
  for (const recipient of recipients) {
    // Check preferences
    const prefCheck = await shouldSendToResident({
      residentId: recipient.id,
      category: template.category as NotificationCategory,
      channel: template.channel as NotificationChannel,
    });

    if (!prefCheck.shouldSend) {
      results.failed++;
      results.errors.push(`${recipient.id}: ${prefCheck.reason || 'Blocked by preferences'}`);
      continue;
    }

    // Merge recipient-specific variables
    const recipientVariables = {
      ...variables,
      resident_name: `${recipient.first_name} ${recipient.last_name}`,
      email: recipient.email,
    };

    // Render template
    let rendered;
    try {
      rendered = renderTemplate(template, recipientVariables);
    } catch (error) {
      results.failed++;
      results.errors.push(
        `${recipient.id}: ${error instanceof Error ? error.message : 'Render failed'}`
      );
      continue;
    }

    if (immediate) {
      // Send immediately
      const sendResult = await sendImmediate({
        recipientId: recipient.id,
        recipientEmail: recipient.email || undefined,
        recipientPhone: recipient.phone_primary,
        channel: template.channel as NotificationChannel,
        subject: rendered.subject || undefined,
        body: rendered.body,
        htmlBody: rendered.html || undefined,
        metadata: { templateId: template.id, bulk: true },
      });

      if (sendResult.success) {
        results.sent++;
        if (sendResult.historyId) affectedIds.push(sendResult.historyId);
      } else {
        results.failed++;
        results.errors.push(`${recipient.id}: ${sendResult.error || 'Send failed'}`);
      }
    } else {
      // Queue for later
      const queueResult = await addToQueue({
        template_id: templateId,
        recipient_id: recipient.id,
        channel: template.channel as NotificationChannel,
        subject: rendered.subject || undefined,
        body: rendered.body,
        html_body: rendered.html || undefined,
        variables: recipientVariables,
        priority,
        metadata: { bulk: true },
      });

      if (queueResult.success) {
        results.queued++;
        if (queueResult.queueId) affectedIds.push(queueResult.queueId);
      } else {
        results.failed++;
        results.errors.push(`${recipient.id}: ${queueResult.error || 'Queue failed'}`);
      }
    }
  }

  results.success = results.failed === 0;

  // Audit log. audit_logs.entity_id is a uuid: the first notification record this call
  // created stands for the batch (#594). Nothing created means nothing to audit.
  if (affectedIds.length > 0) {
    await logAudit({
      action: 'GENERATE',
      entityType: 'notification_history',
      entityId: affectedIds[0],
      entityDisplay: `Bulk ${template.display_name}`,
      newValues: {
        batch: 'bulk',
        total_count: affectedIds.length,
        record_ids: affectedIds.slice(0, 50),
        record_kind: immediate ? 'notification_history' : 'notification_queue',
        templateId,
        recipients: recipientIds.length,
        sent: results.sent,
        queued: results.queued,
        failed: results.failed,
      },
    });
  }

  return results;
}
