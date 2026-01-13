'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

interface QueueFilters {
  channel?: 'email' | 'sms' | 'whatsapp';
  category?: string;
  limit?: number;
  offset?: number;
}

interface QueueStats {
  byChannel: Record<string, number>;
  byCategory: Record<string, number>;
  recentFailures: number;
}

/**
 * Get queued notifications with optional filtering
 *
 * @param filters - Optional filters for channel, category, pagination
 * @returns Array of notifications and total count
 */
export async function getQueuedNotifications(filters?: QueueFilters) {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) return { error: auth.error || 'Unauthorized' };

  const supabase = createAdminClient();
  let query = supabase
    .from('notification_queue')
    .select('*, profiles:recipient_id(email, first_name, last_name)', { count: 'exact' })
    .order('scheduled_at', { ascending: true });

  if (filters?.channel) query = query.eq('channel', filters.channel);
  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.limit) query = query.limit(filters.limit);
  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
  }

  const { data, error, count } = await query;
  return { data, error, count };
}

/**
 * Get statistics about the notification queue
 *
 * @returns Queue stats broken down by channel, category, and failures
 */
export async function getQueueStats() {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) return { error: auth.error || 'Unauthorized' };

  const supabase = createAdminClient();

  // Get all queue items for stats
  const { data: queueItems } = await supabase.from('notification_queue').select('channel, category');

  // Count by channel
  const byChannel = (queueItems || []).reduce(
    (acc, item) => {
      acc[item.channel] = (acc[item.channel] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Count by category
  const byCategory = (queueItems || []).reduce(
    (acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Recent failures (last 24 hours)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const { count: failureCount } = await supabase
    .from('notification_history')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('created_at', yesterday.toISOString());

  const stats: QueueStats = {
    byChannel,
    byCategory,
    recentFailures: failureCount || 0,
  };

  return { data: stats };
}

/**
 * Delete a single notification from the queue
 *
 * @param id - Notification queue ID
 * @returns Success status
 */
export async function deleteQueuedNotification(id: string) {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

  const supabase = createAdminClient();
  const { error } = await supabase.from('notification_queue').delete().eq('id', id);

  if (!error) {
    await logAudit({
      action: 'DELETE',
      entityType: 'notification_queue',
      entityId: id,
      entityDisplay: 'Queued Notification',
    });
  }

  return { success: !error, error: error?.message };
}

/**
 * Clear multiple notifications from the queue
 *
 * @param filters - Optional filters to clear specific notifications
 * @returns Success status and number deleted
 */
export async function clearQueue(filters?: { channel?: string; category?: string }) {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

  const supabase = createAdminClient();
  let query = supabase.from('notification_queue').delete().select('*');

  if (filters?.channel) query = query.eq('channel', filters.channel);
  if (filters?.category) query = query.eq('category', filters.category);

  const { data, error } = await query;
  const count = data?.length || 0;

  if (!error) {
    await logAudit({
      action: 'DELETE',
      entityType: 'notification_queue',
      entityId: 'bulk',
      entityDisplay: 'Clear Notification Queue',
      metadata: { count, filters },
    });
  }

  return { success: !error, deletedCount: count, error: error?.message };
}
