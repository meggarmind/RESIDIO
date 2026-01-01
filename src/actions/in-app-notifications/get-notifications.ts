'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { InAppNotification } from '@/types/database';

export interface NotificationListParams {
  limit?: number;
  offset?: number;
  category?: string;
  unread_only?: boolean;
}

/**
 * Get notifications for the current user
 */
export async function getNotifications(params: NotificationListParams = {}): Promise<{
  data: InAppNotification[];
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
    return { data: [], count: 0, error: 'Unauthorized' };
  }

  // Get resident ID for current user
  const { data: resident } = await supabase
    .from('residents')
    .select('id')
    .eq('profile_id', user.id)
    .eq('account_status', 'active')
    .single();

  if (!resident) {
    return { data: [], count: 0, error: null };
  }

  const { limit = 20, offset = 0, category, unread_only } = params;

  let query = supabase
    .from('in_app_notifications')
    .select('*', { count: 'exact' })
    .eq('recipient_id', resident.id)
    .order('created_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  if (unread_only) {
    query = query.eq('is_read', false);
  }

  // Filter out expired notifications
  query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching notifications:', error);
    return { data: [], count: 0, error: error.message };
  }

  return {
    data: data || [],
    count: count || 0,
    error: null,
  };
}

/**
 * Get unread notification count for the current user
 */
export async function getUnreadNotificationCount(): Promise<{
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

  // Get resident ID for current user
  const { data: resident } = await supabase
    .from('residents')
    .select('id')
    .eq('profile_id', user.id)
    .eq('account_status', 'active')
    .single();

  if (!resident) {
    return { count: 0, error: null };
  }

  const { count, error } = await supabase
    .from('in_app_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', resident.id)
    .eq('is_read', false)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  if (error) {
    console.error('Error fetching unread count:', error);
    return { count: 0, error: error.message };
  }

  return { count: count || 0, error: null };
}

/**
 * Get a single notification by ID
 */
export async function getNotification(id: string): Promise<{
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

  // Get resident ID for current user
  const { data: resident } = await supabase
    .from('residents')
    .select('id')
    .eq('profile_id', user.id)
    .eq('account_status', 'active')
    .single();

  if (!resident) {
    return { data: null, error: 'Resident not found' };
  }

  const { data, error } = await supabase
    .from('in_app_notifications')
    .select('*')
    .eq('id', id)
    .eq('recipient_id', resident.id)
    .single();

  if (error) {
    console.error('Error fetching notification:', error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}
