/**
 * Notification Deduplication
 *
 * Prevents duplicate notifications by checking existing queue and history
 * using a composite deduplication key strategy.
 */

import { createAdminClient } from '@/lib/supabase/server';
import type {
  NotificationChannel,
  NotificationCategory,
  DeduplicationCheckResult,
} from './types';

/**
 * Default deduplication window in minutes (24 hours)
 */
export const DEFAULT_DEDUP_WINDOW_MINUTES = 1440;

/**
 * Generate a deduplication key for a notification
 *
 * Format: {channel}:{category}:{entity_type}:{entity_id}:{resident_id}
 *
 * Examples:
 * - email:payment:invoice:uuid-123:uuid-456
 * - email:general:resident:uuid-789:uuid-789
 */
export function generateDeduplicationKey(params: {
  channel: NotificationChannel;
  category: NotificationCategory;
  entityType: string;
  entityId: string;
  residentId: string;
}): string {
  const { channel, category, entityType, entityId, residentId } = params;
  return `${channel}:${category}:${entityType}:${entityId}:${residentId}`;
}

/**
 * Parse a deduplication key back into its components
 */
export function parseDeduplicationKey(key: string): {
  channel: NotificationChannel;
  category: NotificationCategory;
  entityType: string;
  entityId: string;
  residentId: string;
} | null {
  const parts = key.split(':');
  if (parts.length !== 5) {
    return null;
  }

  return {
    channel: parts[0] as NotificationChannel,
    category: parts[1] as NotificationCategory,
    entityType: parts[2],
    entityId: parts[3],
    residentId: parts[4],
  };
}

/**
 * Check if a notification with the same deduplication key already exists
 *
 * Checks both the queue (pending/processing) and history (sent) within
 * the specified time window.
 */
export async function checkDuplication(
  deduplicationKey: string,
  windowMinutes: number = DEFAULT_DEDUP_WINDOW_MINUTES
): Promise<DeduplicationCheckResult> {
  const supabase = createAdminClient();

  // Calculate the cutoff time
  const cutoffTime = new Date();
  cutoffTime.setMinutes(cutoffTime.getMinutes() - windowMinutes);
  const cutoffIso = cutoffTime.toISOString();

  // Check the notification queue for pending/processing items
  const { data: queueItem, error: queueError } = await supabase
    .from('notification_queue')
    .select('id, status, created_at')
    .eq('deduplication_key', deduplicationKey)
    .in('status', ['pending', 'processing', 'sent'])
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (queueItem && !queueError) {
    return {
      isDuplicate: true,
      existingId: queueItem.id,
      reason: `Duplicate found in queue (status: ${queueItem.status})`,
    };
  }

  // Check the notification history for recently sent items
  const { data: historyItem, error: historyError } = await supabase
    .from('notification_history')
    .select('id, status, created_at')
    .eq('metadata->>deduplication_key', deduplicationKey)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (historyItem && !historyError) {
    return {
      isDuplicate: true,
      existingId: historyItem.id,
      reason: `Duplicate found in history (status: ${historyItem.status})`,
    };
  }

  return {
    isDuplicate: false,
  };
}

/**
 * Check for duplicates before adding to queue
 *
 * This is a convenience function that combines key generation and checking.
 */
export async function shouldQueue(params: {
  channel: NotificationChannel;
  category: NotificationCategory;
  entityType: string;
  entityId: string;
  residentId: string;
  windowMinutes?: number;
}): Promise<{
  shouldQueue: boolean;
  deduplicationKey: string;
  duplicateInfo?: DeduplicationCheckResult;
}> {
  const {
    channel,
    category,
    entityType,
    entityId,
    residentId,
    windowMinutes = DEFAULT_DEDUP_WINDOW_MINUTES,
  } = params;

  const deduplicationKey = generateDeduplicationKey({
    channel,
    category,
    entityType,
    entityId,
    residentId,
  });

  const checkResult = await checkDuplication(deduplicationKey, windowMinutes);

  return {
    shouldQueue: !checkResult.isDuplicate,
    deduplicationKey,
    duplicateInfo: checkResult.isDuplicate ? checkResult : undefined,
  };
}

/**
 * Clear old deduplication entries from the queue
 * (for maintenance/cleanup operations)
 *
 * This removes cancelled/failed items older than the retention period.
 */
export async function cleanupOldQueueEntries(
  retentionDays: number = 30
): Promise<{ deleted: number }> {
  const supabase = createAdminClient();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const { data, error } = await supabase
    .from('notification_queue')
    .delete()
    .in('status', ['cancelled', 'failed'])
    .lt('created_at', cutoffDate.toISOString())
    .select('id');

  if (error) {
    console.error('[Dedup] Failed to cleanup old queue entries:', error);
    return { deleted: 0 };
  }

  return { deleted: data?.length || 0 };
}

/**
 * Get duplicate notifications for an entity
 * Useful for debugging and audit purposes
 */
export async function getDuplicatesForEntity(
  entityType: string,
  entityId: string,
  limit: number = 10
): Promise<{ queue: unknown[]; history: unknown[] }> {
  const supabase = createAdminClient();
  const keyPattern = `%:${entityType}:${entityId}:%`;

  // Query queue
  const { data: queueItems } = await supabase
    .from('notification_queue')
    .select('id, deduplication_key, status, created_at, recipient_id')
    .like('deduplication_key', keyPattern)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Query history
  const { data: historyItems } = await supabase
    .from('notification_history')
    .select('id, status, created_at, recipient_id, metadata')
    .like('metadata->>deduplication_key', keyPattern)
    .order('created_at', { ascending: false })
    .limit(limit);

  return {
    queue: queueItems || [],
    history: historyItems || [],
  };
}
