'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { InAppNotification } from '@/types/database';

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(id: string): Promise<{
  data: InAppNotification | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: 'Unauthorized' };
  }

  // No longer need to fetch resident record. Use current user's profile ID directly.
  const resident = { id: user.id };

  const { data, error } = await supabase
    .from('in_app_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('recipient_id', resident.id)
    .select()
    .single();

  if (error) {
    console.error('Error marking notification as read:', error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

/**
 * Mark all notifications as read for the current user
 */
export async function markAllNotificationsAsRead(): Promise<{
  count: number;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { count: 0, error: 'Unauthorized' };
  }

  // No longer need to fetch resident record. Use current user's profile ID directly.
  const resident = { id: user.id };

  const { data, error } = await supabase
    .from('in_app_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('recipient_id', resident.id)
    .eq('is_read', false)
    .select();

  if (error) {
    console.error('Error marking all notifications as read:', error);
    return { count: 0, error: error.message };
  }

  return { count: data?.length || 0, error: null };
}

/**
 * Delete a notification (user's own)
 */
export async function deleteNotification(id: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // No longer need to fetch resident record. Use current user's profile ID directly.
  const resident = { id: user.id };

  const { error } = await supabase
    .from('in_app_notifications')
    .delete()
    .eq('id', id)
    .eq('recipient_id', resident.id);

  if (error) {
    console.error('Error deleting notification:', error);
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

/**
 * Delete all read notifications for the current user
 */
export async function deleteReadNotifications(): Promise<{
  count: number;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { count: 0, error: 'Unauthorized' };
  }

  // No longer need to fetch resident record. Use current user's profile ID directly.
  const resident = { id: user.id };

  // First count how many will be deleted
  const { count } = await supabase
    .from('in_app_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', resident.id)
    .eq('is_read', true);

  const { error } = await supabase
    .from('in_app_notifications')
    .delete()
    .eq('recipient_id', resident.id)
    .eq('is_read', true);

  if (error) {
    console.error('Error deleting read notifications:', error);
    return { count: 0, error: error.message };
  }

  return { count: count || 0, error: null };
}

/**
 * Delete a notification by admin (any notification)
 * Requires notifications.manage permission
 */
export async function adminDeleteNotification(id: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from('in_app_notifications').delete().eq('id', id);

  if (error) {
    console.error('Error deleting notification:', error);
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}
