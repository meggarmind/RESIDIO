/**
 * Notification Queue Management
 *
 * Functions for adding to queue, processing queue items, cancelling, and retrying.
 */

import { createAdminClient } from '@/lib/supabase/server';
import type {
  NotificationChannel,
  NotificationCategory,
  NotificationQueueItem,
  QueueNotificationInput,
  ProcessQueueResult,
} from './types';
import { shouldQueue, generateDeduplicationKey } from './deduplication';
import { sendAndRecordNotification } from './send';

/**
 * Default priority levels
 */
export const PRIORITY = {
  URGENT: 1,
  HIGH: 3,
  NORMAL: 5,
  LOW: 7,
  BULK: 9,
} as const;

/**
 * Add a notification to the queue
 *
 * Performs deduplication check before adding.
 */
export async function addToQueue(
  input: QueueNotificationInput,
  options?: {
    skipDedup?: boolean;
    entityType?: string;
    entityId?: string;
    category?: NotificationCategory;
  }
): Promise<{ success: boolean; queueId?: string; error?: string; isDuplicate?: boolean }> {
  const supabase = createAdminClient();

  // Generate deduplication key if we have the necessary info
  let deduplicationKey = input.deduplication_key;

  if (!deduplicationKey && options?.entityType && options?.entityId && options?.category) {
    const dedupCheck = await shouldQueue({
      channel: input.channel,
      category: options.category,
      entityType: options.entityType,
      entityId: options.entityId,
      residentId: input.recipient_id,
      windowMinutes: input.dedup_window_minutes,
    });

    if (!dedupCheck.shouldQueue && !options?.skipDedup) {
      return {
        success: false,
        isDuplicate: true,
        error: dedupCheck.duplicateInfo?.reason || 'Duplicate notification detected',
      };
    }

    deduplicationKey = dedupCheck.deduplicationKey;
  }

  // Insert into queue
  const { data, error } = await supabase
    .from('notification_queue')
    .insert({
      template_id: input.template_id,
      schedule_id: input.schedule_id,
      recipient_id: input.recipient_id,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      html_body: input.html_body,
      variables: input.variables,
      priority: input.priority ?? PRIORITY.NORMAL,
      status: 'pending',
      deduplication_key: deduplicationKey,
      dedup_window_minutes: input.dedup_window_minutes,
      scheduled_for: input.scheduled_for?.toISOString() ?? new Date().toISOString(),
      metadata: input.metadata,
    })
    .select('id')
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
    queueId: data.id,
  };
}

/**
 * Add multiple notifications to the queue in batch
 *
 * More efficient than individual addToQueue calls.
 */
export async function addBatchToQueue(
  items: Array<QueueNotificationInput & {
    entityType?: string;
    entityId?: string;
    category?: NotificationCategory;
  }>,
  options?: {
    skipDedup?: boolean;
  }
): Promise<{
  success: boolean;
  added: number;
  skipped: number;
  errors: string[];
}> {
  const supabase = createAdminClient();
  const toInsert: Array<{
    template_id: string | undefined;
    schedule_id: string | undefined;
    recipient_id: string;
    channel: NotificationChannel;
    subject: string | undefined;
    body: string;
    html_body: string | undefined;
    variables: Record<string, unknown> | undefined;
    priority: number;
    status: string;
    deduplication_key: string | undefined;
    scheduled_for: string;
    metadata: Record<string, unknown> | undefined;
  }> = [];
  const errors: string[] = [];
  let skipped = 0;

  // Process each item
  for (const item of items) {
    let deduplicationKey = item.deduplication_key;

    // Generate dedup key and check if needed
    if (!options?.skipDedup && item.entityType && item.entityId && item.category) {
      const dedupCheck = await shouldQueue({
        channel: item.channel,
        category: item.category,
        entityType: item.entityType,
        entityId: item.entityId,
        residentId: item.recipient_id,
        windowMinutes: item.dedup_window_minutes,
      });

      if (!dedupCheck.shouldQueue) {
        skipped++;
        continue;
      }

      deduplicationKey = dedupCheck.deduplicationKey;
    }

    toInsert.push({
      template_id: item.template_id,
      schedule_id: item.schedule_id,
      recipient_id: item.recipient_id,
      channel: item.channel,
      subject: item.subject,
      body: item.body,
      html_body: item.html_body,
      variables: item.variables,
      priority: item.priority ?? PRIORITY.NORMAL,
      status: 'pending',
      deduplication_key: deduplicationKey,
      scheduled_for: item.scheduled_for?.toISOString() ?? new Date().toISOString(),
      metadata: item.metadata,
    });
  }

  // Batch insert
  if (toInsert.length > 0) {
    const { error } = await supabase.from('notification_queue').insert(toInsert);

    if (error) {
      errors.push(error.message);
      return {
        success: false,
        added: 0,
        skipped,
        errors,
      };
    }
  }

  return {
    success: true,
    added: toInsert.length,
    skipped,
    errors,
  };
}

/**
 * Process pending queue items
 *
 * Fetches items that are due for sending and processes them.
 */
export async function processQueue(options?: {
  batchSize?: number;
  channel?: NotificationChannel;
}): Promise<ProcessQueueResult> {
  const supabase = createAdminClient();
  const batchSize = options?.batchSize ?? 50;
  const now = new Date().toISOString();

  // Build query
  let query = supabase
    .from('notification_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('priority', { ascending: true })
    .order('scheduled_for', { ascending: true })
    .limit(batchSize);

  // Filter by channel if specified
  if (options?.channel) {
    query = query.eq('channel', options.channel);
  }

  const { data: items, error } = await query;

  if (error) {
    console.error('[Queue] Failed to fetch queue items:', error);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [{ queueId: 'fetch', error: error.message }],
    };
  }

  if (!items || items.length === 0) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };
  }

  const result: ProcessQueueResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Process each item
  for (const item of items) {
    result.processed++;

    // Mark as processing
    await supabase
      .from('notification_queue')
      .update({ status: 'processing' })
      .eq('id', item.id);

    // Check max attempts
    if (item.attempts >= item.max_attempts) {
      await supabase
        .from('notification_queue')
        .update({
          status: 'failed',
          error_message: 'Max attempts exceeded',
        })
        .eq('id', item.id);
      result.failed++;
      result.errors.push({
        queueId: item.id,
        error: 'Max attempts exceeded',
      });
      continue;
    }

    // Send the notification
    const sendResult = await sendAndRecordNotification(item as NotificationQueueItem);

    if (sendResult.success) {
      result.sent++;
    } else {
      result.failed++;
      if (sendResult.error) {
        result.errors.push({
          queueId: item.id,
          error: sendResult.error,
        });
      }
    }
  }

  return result;
}

/**
 * Cancel a queued notification
 */
export async function cancelQueueItem(
  queueId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('notification_queue')
    .update({
      status: 'cancelled',
      error_message: reason || 'Cancelled by user',
    })
    .eq('id', queueId)
    .in('status', ['pending', 'processing']); // Only cancel if not already sent

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Retry a failed notification
 */
export async function retryQueueItem(
  queueId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  // Reset status and clear error
  const { error } = await supabase
    .from('notification_queue')
    .update({
      status: 'pending',
      error_message: null,
      scheduled_for: new Date().toISOString(),
    })
    .eq('id', queueId)
    .eq('status', 'failed'); // Only retry failed items

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  cancelled: number;
  total: number;
}> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('notification_queue')
    .select('status')
    .not('status', 'is', null);

  if (error || !data) {
    return { pending: 0, processing: 0, sent: 0, failed: 0, cancelled: 0, total: 0 };
  }

  const stats = {
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    total: data.length,
  };

  for (const item of data) {
    const status = item.status as keyof typeof stats;
    if (status in stats) {
      stats[status]++;
    }
  }

  return stats;
}

/**
 * Get queue items by status
 */
export async function getQueueItems(
  status?: string,
  limit = 50
): Promise<NotificationQueueItem[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from('notification_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Queue] Failed to fetch queue items:', error);
    return [];
  }

  return (data as NotificationQueueItem[]) || [];
}

/**
 * Purge old sent/cancelled items from queue
 * Keeps the queue table lean for better performance.
 */
export async function purgeOldItems(
  olderThanDays = 30
): Promise<{ deleted: number; error?: string }> {
  const supabase = createAdminClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const { data, error } = await supabase
    .from('notification_queue')
    .delete()
    .in('status', ['sent', 'cancelled'])
    .lt('created_at', cutoff.toISOString())
    .select('id');

  if (error) {
    return { deleted: 0, error: error.message };
  }

  return { deleted: data?.length || 0 };
}
