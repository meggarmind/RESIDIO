'use server';

/**
 * Server Actions for Notification Queue
 *
 * Queue management operations: view, cancel, retry, send.
 */

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
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
import type {
  NotificationQueueItem,
  QueueItemWithDetails,
  QueueStatus,
  ProcessQueueResult,
  NotificationCategory,
  NotificationChannel,
} from '@/lib/notifications/types';

/**
 * Get queue items with optional filtering.
 * Admin operation — guarded by `notifications.manage` (super_admin, chairman,
 * vice_chairman). Reachable only from the /system, /settings/notifications and
 * /settings/notification-queue admin pages, which the route middleware already
 * gates on the same permission; this closes the gap for anyone calling the
 * server action directly.
 */
export async function getNotificationQueue(options?: {
  status?: QueueStatus;
  channel?: NotificationChannel;
  limit?: number;
}): Promise<{ data: QueueItemWithDetails[] | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Insufficient permissions' };
  }

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
 * Get a single queue item by ID.
 * Admin operation — guarded by `notifications.manage`. Unlike
 * `getNotificationQueue`, this export has no live caller today: no hook
 * wraps it and nothing imports it directly. Same "no live caller" bucket as
 * `queueDirectNotification` below;
 * guarded the same way so it is safe the moment a caller is added.
 */
export async function getQueueItem(
  id: string
): Promise<{ data: QueueItemWithDetails | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Insufficient permissions' };
  }

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
 * Get queue statistics.
 * Admin operation — guarded by `notifications.manage`. This is the priority
 * fix from issue #181: `getQueueStats()` (in `@/lib/notifications/queue`) uses
 * `createAdminClient()`, the service-role client, so RLS never bounded this
 * read — before this guard, any authenticated user could call it directly and
 * get the queue depth. The route (`/system` dashboard, `/system/notification-queue`)
 * was already permission-gated in the UI, but that is not a server-side boundary.
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
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Insufficient permissions' };
  }

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
 * Queue a direct notification (no template).
 * Admin operation — guarded by `notifications.manage`. Verified: this export
 * is imported by `src/hooks/use-notifications.ts` but never actually wrapped
 * in a hook or called there (no `useQueueDirectNotification` exists) — it has
 * no live caller anywhere in the codebase today. Guarded for when a caller is added; being
 * unused today means this guard changes no current behaviour.
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
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Insufficient permissions' };
  }

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
 * Cancel a queued notification.
 * Admin operation — guarded by `notifications.manage`. Called only from
 * `useCancelNotification` in the admin notification-queue viewer.
 */
export async function cancelNotification(
  queueId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Insufficient permissions' };
  }

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
 * Retry a failed notification.
 * Admin operation — guarded by `notifications.manage`. Called only from
 * `useRetryNotification` in the admin notification-queue viewer.
 */
export async function retryNotification(
  queueId: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Insufficient permissions' };
  }

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
 *
 * Admin operation — guarded by `notifications.manage`. The cron trigger for
 * this same underlying work runs through a separate `CRON_SECRET`-authenticated
 * route (`src/app/api/cron/process-notifications/route.ts`), which calls
 * `processQueue()` from `@/lib/notifications/queue` directly, not this
 * server action — so cron is unaffected either way. This action itself has
 * no live caller today either: `useProcessQueue` in
 * `src/hooks/use-notifications.ts` wraps it but is never invoked by any
 * component, the same "no live caller" bucket as the queue/template
 * mutations above. Guarded now so it is safe the moment a "process now"
 * button is wired up.
 */
export async function processNotificationQueue(options?: {
  batchSize?: number;
  channel?: NotificationChannel;
}): Promise<{ data: ProcessQueueResult | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Insufficient permissions' };
  }

  try {
    const startedAt = new Date().toISOString();
    const result = await processQueue(options);

    // Audit log. audit_logs.entity_id is a uuid: the first queue item this run attempted
    // stands for the batch (#594). Nothing processed means nothing to audit.
    if (result.processed > 0) {
      const { data: attempted } = await createAdminClient()
        .from('notification_queue')
        .select('id')
        .gte('last_attempt_at', startedAt)
        .order('last_attempt_at', { ascending: true })
        .limit(50);
      const queueIds = [
        ...new Set([
          ...(attempted ?? []).map((q: { id: string }) => q.id),
          ...result.errors.map((e) => e.queueId).filter((id) => id !== 'fetch'),
        ]),
      ].slice(0, 50);

      if (queueIds.length > 0) {
        await logAudit({
          action: 'GENERATE',
          entityType: 'notification_queue',
          entityId: queueIds[0],
          entityDisplay: 'Queue Processing',
          newValues: {
            batch: 'queue_processing',
            total_count: result.processed,
            queue_ids: queueIds,
            processed: result.processed,
            sent: result.sent,
            failed: result.failed,
            skipped: result.skipped,
          },
        });
      }
    }

    return { data: result, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to process queue',
    };
  }
}

/**
 * Get queue items for a specific recipient.
 *
 * Admin operation, not resident self-service — guarded by `notifications.manage`.
 * `residentId` is caller-supplied rather than derived from the caller's own
 * session, which is the shape of an admin/staff "look up this resident's
 * queue" tool, not a self-service endpoint; a resident-scoped guard would
 * need `residentId` to come from the session, not a parameter. Verified there
 * is no live caller today — this export is re-exported from
 * `actions/notifications/index.ts` but nothing in `src/` actually invokes it
 * (no hook wraps it, no component calls it), so this guard changes no current
 * behaviour. Per CLAUDE.md, resident-portal self-service is not planned for
 * rollout, so it is not wired to one here either.
 */
export async function getQueueForResident(
  residentId: string,
  options?: { status?: QueueStatus; limit?: number }
): Promise<{ data: QueueItemWithDetails[] | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Insufficient permissions' };
  }

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
