'use server';

/**
 * Server Actions for Notification Queue
 *
 * Queue management operations: view, cancel, retry, send.
 */

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import {
  addToQueue,
  cancelQueueItem,
  retryQueueItem,
  getQueueStats,
  getQueueItems,
  processQueue,
  PRIORITY,
} from '@/lib/notifications/queue';
import {
  renderTemplate,
  shouldSendToResident,
  generateDeduplicationKey,
} from '@/lib/notifications';
import { getTemplate } from './templates';
import type {
  NotificationQueueItem,
  QueueItemWithDetails,
  QueueStatus,
  ProcessQueueResult,
  NotificationCategory,
  NotificationChannel,
} from '@/lib/notifications/types';

/**
 * Get queue items with optional filtering
 */
export async function getNotificationQueue(options?: {
  status?: QueueStatus;
  channel?: NotificationChannel;
  limit?: number;
}): Promise<{ data: QueueItemWithDetails[] | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('notification_queue')
    .select(`
      *,
      template:notification_templates(id, name, display_name, category),
      recipient:residents(id, first_name, last_name, email, phone_primary, resident_code)
    `)
    .order('priority', { ascending: true })
    .order('scheduled_for', { ascending: true })
    .limit(options?.limit || 50);

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.channel) {
    query = query.eq('channel', options.channel);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as QueueItemWithDetails[], error: null };
}

/**
 * Get a single queue item by ID
 */
export async function getQueueItem(
  id: string
): Promise<{ data: QueueItemWithDetails | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('notification_queue')
    .select(`
      *,
      template:notification_templates(id, name, display_name, category),
      recipient:residents(id, first_name, last_name, email, phone_primary, resident_code)
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as QueueItemWithDetails, error: null };
}

/**
 * Get queue statistics
 */
export async function getQueueStatistics(): Promise<{
  data: {
    pending: number;
    processing: number;
    sent: number;
    failed: number;
    cancelled: number;
    total: number;
  } | null;
  error: string | null;
}> {
  try {
    const stats = await getQueueStats();
    return { data: stats, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get queue statistics',
    };
  }
}

/**
 * Queue a notification using a template
 */
export async function queueNotificationFromTemplate(params: {
  templateId: string;
  recipientId: string;
  variables: Record<string, unknown>;
  priority?: number;
  scheduledFor?: Date;
  entityType?: string;
  entityId?: string;
}): Promise<{ success: boolean; queueId?: string; error?: string }> {
  const { templateId, recipientId, variables, priority, scheduledFor, entityType, entityId } = params;

  // Get template
  const { data: template, error: templateError } = await getTemplate(templateId);
  if (templateError || !template) {
    return { success: false, error: templateError || 'Template not found' };
  }

  // Check resident preferences
  const prefCheck = await shouldSendToResident({
    residentId: recipientId,
    category: template.category as NotificationCategory,
    channel: template.channel as NotificationChannel,
  });

  if (!prefCheck.shouldSend) {
    return { success: false, error: prefCheck.reason || 'Notification blocked by preferences' };
  }

  // Get recipient details
  const supabase = createAdminClient();
  const { data: recipient, error: recipientError } = await supabase
    .from('residents')
    .select('id, email, phone_primary')
    .eq('id', recipientId)
    .single();

  if (recipientError || !recipient) {
    return { success: false, error: 'Recipient not found' };
  }

  // Render template
  let rendered;
  try {
    rendered = renderTemplate(template, variables);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to render template',
    };
  }

  // Add to queue
  const result = await addToQueue(
    {
      template_id: templateId,
      recipient_id: recipientId,
      channel: template.channel as NotificationChannel,
      subject: rendered.subject || undefined,
      body: rendered.body,
      html_body: rendered.html || undefined,
      variables,
      priority: priority ?? PRIORITY.NORMAL,
      scheduled_for: scheduledFor,
      metadata: { entityType, entityId },
    },
    {
      entityType,
      entityId,
      category: template.category as NotificationCategory,
    }
  );

  if (result.success) {
    // Audit log
    await logAudit({
      action: 'CREATE',
      entityType: 'notification_queue',
      entityId: result.queueId!,
      entityDisplay: `${template.display_name} to ${recipientId}`,
      newValues: { templateId, recipientId, channel: template.channel },
    });
  }

  return result;
}

/**
 * Queue a direct notification (no template)
 */
export async function queueDirectNotification(params: {
  recipientId: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  htmlBody?: string;
  priority?: number;
  scheduledFor?: Date;
  category?: NotificationCategory;
  entityType?: string;
  entityId?: string;
}): Promise<{ success: boolean; queueId?: string; error?: string }> {
  const {
    recipientId,
    channel,
    subject,
    body,
    htmlBody,
    priority,
    scheduledFor,
    category,
    entityType,
    entityId,
  } = params;

  // Check resident preferences if category is provided
  if (category) {
    const prefCheck = await shouldSendToResident({
      residentId: recipientId,
      category,
      channel,
    });

    if (!prefCheck.shouldSend) {
      return { success: false, error: prefCheck.reason || 'Notification blocked by preferences' };
    }
  }

  // Add to queue
  const result = await addToQueue(
    {
      recipient_id: recipientId,
      channel,
      subject,
      body,
      html_body: htmlBody,
      priority: priority ?? PRIORITY.NORMAL,
      scheduled_for: scheduledFor,
      metadata: { entityType, entityId, direct: true },
    },
    {
      entityType,
      entityId,
      category,
    }
  );

  if (result.success) {
    // Audit log
    await logAudit({
      action: 'CREATE',
      entityType: 'notification_queue',
      entityId: result.queueId!,
      entityDisplay: `Direct ${channel} to ${recipientId}`,
      newValues: { recipientId, channel, subject },
    });
  }

  return result;
}

/**
 * Cancel a queued notification
 */
export async function cancelNotification(
  queueId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const result = await cancelQueueItem(queueId, reason);

  if (result.success) {
    // Audit log
    await logAudit({
      action: 'UPDATE',
      entityType: 'notification_queue',
      entityId: queueId,
      entityDisplay: `Queue item ${queueId}`,
      newValues: { status: 'cancelled', reason },
    });
  }

  return result;
}

/**
 * Retry a failed notification
 */
export async function retryNotification(
  queueId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await retryQueueItem(queueId);

  if (result.success) {
    // Audit log
    await logAudit({
      action: 'UPDATE',
      entityType: 'notification_queue',
      entityId: queueId,
      entityDisplay: `Queue item ${queueId}`,
      newValues: { status: 'pending', retried: true },
    });
  }

  return result;
}

/**
 * Manually process the notification queue
 * (Usually triggered by cron, but can be done manually)
 */
export async function processNotificationQueue(options?: {
  batchSize?: number;
  channel?: NotificationChannel;
}): Promise<{ data: ProcessQueueResult | null; error: string | null }> {
  try {
    const result = await processQueue(options);

    // Audit log
    await logAudit({
      action: 'GENERATE',
      entityType: 'notification_queue',
      entityId: 'batch',
      entityDisplay: 'Queue Processing',
      newValues: {
        processed: result.processed,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
      },
    });

    return { data: result, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to process queue',
    };
  }
}

/**
 * Get queue items for a specific recipient
 */
export async function getQueueForResident(
  residentId: string,
  options?: { status?: QueueStatus; limit?: number }
): Promise<{ data: QueueItemWithDetails[] | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('notification_queue')
    .select(`
      *,
      template:notification_templates(id, name, display_name, category)
    `)
    .eq('recipient_id', residentId)
    .order('created_at', { ascending: false })
    .limit(options?.limit || 20);

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as QueueItemWithDetails[], error: null };
}
