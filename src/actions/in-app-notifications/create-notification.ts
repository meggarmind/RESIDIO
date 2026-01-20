'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { InAppNotification } from '@/types/database';

export interface NotificationCreateInput {
  recipient_id: string;
  title: string;
  body: string;
  icon?: string;
  category: string;
  entity_type?: string;
  entity_id?: string;
  action_url?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: Record<string, unknown>;
  expires_at?: string;
}

/**
 * Create a notification for a specific resident
 * Requires notifications.send permission
 */
export async function createNotification(input: NotificationCreateInput): Promise<{
  data: InAppNotification | null;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_SEND);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('in_app_notifications')
    .insert({
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
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating notification:', error);
    return { data: null, error: error.message };
  }

  return { data, error: null };
}

/**
 * Create notifications for multiple recipients (bulk)
 * Requires notifications.send permission
 */
export async function createBulkNotifications(
  notifications: NotificationCreateInput[]
): Promise<{
  count: number;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_SEND);
  if (!auth.authorized) {
    return { count: 0, error: auth.error || 'Unauthorized' };
  }

  if (notifications.length === 0) {
    return { count: 0, error: null };
  }

  const supabase = await createServerSupabaseClient();

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

  const { data, error } = await supabase
    .from('in_app_notifications')
    .insert(insertData)
    .select();

  if (error) {
    console.error('Error creating bulk notifications:', error);
    return { count: 0, error: error.message };
  }

  return { count: data?.length || 0, error: null };
}

/**
 * Create notifications for all residents in specific houses
 * Requires notifications.send permission
 */
export async function createNotificationsForHouses(
  houseIds: string[],
  notification: Omit<NotificationCreateInput, 'recipient_id'>
): Promise<{
  count: number;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_SEND);
  if (!auth.authorized) {
    return { count: 0, error: auth.error || 'Unauthorized' };
  }

  if (houseIds.length === 0) {
    return { count: 0, error: null };
  }

  const supabase = await createServerSupabaseClient();

  // Get all active profiles in the specified houses
  const { data: residents, error: residentsError } = await supabase
    .from('resident_houses')
    .select('residents!resident_houses_resident_id_fkey(profile_id)')
    .in('house_id', houseIds)
    .eq('is_active', true);

  if (residentsError) {
    console.error('Error fetching residents:', residentsError);
    return { count: 0, error: residentsError.message };
  }

  if (!residents || residents.length === 0) {
    return { count: 0, error: null };
  }

  // Get unique profile IDs
  const uniqueProfileIds = [...new Set(residents
    .map((r: any) => r.residents?.profile_id)
    .filter(Boolean)
  )] as string[];

  const notifications = uniqueProfileIds.map((profileId) => ({
    ...notification,
    recipient_id: profileId,
  }));

  return createBulkNotifications(notifications);
}

/**
 * Create notifications for all active residents
 * Requires notifications.send permission
 */
export async function createNotificationsForAllResidents(
  notification: Omit<NotificationCreateInput, 'recipient_id'>
): Promise<{
  count: number;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.NOTIFICATIONS_SEND);
  if (!auth.authorized) {
    return { count: 0, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get all active profiles linked to residents
  const { data: residents, error: residentsError } = await supabase
    .from('residents')
    .select('profile_id')
    .eq('account_status', 'active');

  if (residentsError) {
    console.error('Error fetching residents:', residentsError);
    return { count: 0, error: residentsError.message };
  }

  if (!residents || residents.length === 0) {
    return { count: 0, error: null };
  }

  const notifications = (residents || [])
    .map((resident) => resident.profile_id)
    .filter(Boolean)
    .map((profileId) => ({
      ...notification,
      recipient_id: profileId as string,
    }));

  return createBulkNotifications(notifications);
}
