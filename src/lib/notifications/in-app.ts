import type { createServerSupabaseClient } from '@/lib/supabase/server';
import type { NotificationCreateInput } from '@/actions/in-app-notifications/create-notification';

type InAppSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * Insert in-app notifications with the given client. NOT a server action (no 'use server'): it
 * checks no permission and writes no audit entry. `createBulkNotifications` wraps it with both for
 * signed-in callers; sessionless cron routes pass the admin client (#876).
 */
export async function insertBulkNotifications(
  supabase: InAppSupabase,
  notifications: NotificationCreateInput[]
) {
  const insertData = notifications.map((input) => ({
    recipient_id: input.recipient_id,
    title: input.title,
    body: input.body,
    icon: input.icon || null,
    category: input.category,
    entity_type: input.entity_type || null,
    entity_id: input.entity_id || null,
    action_url: input.action_url || null,
    priority: input.priority || 'normal',
    metadata: input.metadata || {},
    expires_at: input.expires_at || null,
    is_read: false,
  }));

  return supabase.from('in_app_notifications').insert(insertData).select();
}
