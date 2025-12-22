'use server';

/**
 * Server Actions for Notification History
 *
 * Query notification history for tracking and reporting.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  NotificationHistoryEntry,
  HistoryEntryWithDetails,
  HistoryStatus,
  NotificationChannel,
} from '@/lib/notifications/types';

/**
 * Get notification history with filtering
 */
export async function getNotificationHistory(options?: {
  recipientId?: string;
  templateId?: string;
  channel?: NotificationChannel;
  status?: HistoryStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{
  data: HistoryEntryWithDetails[] | null;
  count: number;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('notification_history')
    .select(`
      *,
      template:notification_templates(id, name, display_name, category),
      recipient:residents(id, first_name, last_name, email, phone_primary, resident_code)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options?.recipientId) {
    query = query.eq('recipient_id', options.recipientId);
  }

  if (options?.templateId) {
    query = query.eq('template_id', options.templateId);
  }

  if (options?.channel) {
    query = query.eq('channel', options.channel);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.fromDate) {
    query = query.gte('created_at', options.fromDate.toISOString());
  }

  if (options?.toDate) {
    query = query.lte('created_at', options.toDate.toISOString());
  }

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return { data: null, count: 0, error: error.message };
  }

  return {
    data: data as HistoryEntryWithDetails[],
    count: count || 0,
    error: null,
  };
}

/**
 * Get a single history entry by ID
 */
export async function getHistoryEntry(
  id: string
): Promise<{ data: HistoryEntryWithDetails | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('notification_history')
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

  return { data: data as HistoryEntryWithDetails, error: null };
}

/**
 * Get notification history for a resident
 */
export async function getHistoryForResident(
  residentId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: HistoryStatus;
  }
): Promise<{
  data: HistoryEntryWithDetails[] | null;
  count: number;
  error: string | null;
}> {
  return getNotificationHistory({
    recipientId: residentId,
    status: options?.status,
    limit: options?.limit,
    offset: options?.offset,
  });
}

/**
 * Get notification statistics
 */
export async function getNotificationStats(options?: {
  fromDate?: Date;
  toDate?: Date;
}): Promise<{
  data: {
    total: number;
    sent: number;
    failed: number;
    delivered: number;
    opened: number;
    byChannel: Record<NotificationChannel, number>;
    byStatus: Record<HistoryStatus, number>;
  } | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('notification_history')
    .select('status, channel');

  if (options?.fromDate) {
    query = query.gte('created_at', options.fromDate.toISOString());
  }

  if (options?.toDate) {
    query = query.lte('created_at', options.toDate.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  // Calculate stats
  const stats = {
    total: data?.length || 0,
    sent: 0,
    failed: 0,
    delivered: 0,
    opened: 0,
    byChannel: { email: 0, sms: 0, whatsapp: 0 } as Record<NotificationChannel, number>,
    byStatus: {
      sent: 0,
      failed: 0,
      bounced: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
    } as Record<HistoryStatus, number>,
  };

  for (const item of data || []) {
    // By status
    const status = item.status as HistoryStatus;
    if (status in stats.byStatus) {
      stats.byStatus[status]++;
    }

    // By channel
    const channel = item.channel as NotificationChannel;
    if (channel in stats.byChannel) {
      stats.byChannel[channel]++;
    }

    // Aggregate counts
    if (status === 'sent') stats.sent++;
    if (status === 'failed') stats.failed++;
    if (status === 'delivered') stats.delivered++;
    if (status === 'opened') stats.opened++;
  }

  return { data: stats, error: null };
}

/**
 * Get recent notifications for dashboard
 */
export async function getRecentNotifications(
  limit: number = 10
): Promise<{ data: HistoryEntryWithDetails[] | null; error: string | null }> {
  const { data, error } = await getNotificationHistory({ limit });
  return { data, error };
}

/**
 * Search notification history
 */
export async function searchNotificationHistory(params: {
  search: string;
  limit?: number;
}): Promise<{ data: HistoryEntryWithDetails[] | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  const { search, limit = 20 } = params;

  // Search in subject and body_preview
  const { data, error } = await supabase
    .from('notification_history')
    .select(`
      *,
      template:notification_templates(id, name, display_name, category),
      recipient:residents(id, first_name, last_name, email, phone_primary, resident_code)
    `)
    .or(`subject.ilike.%${search}%,body_preview.ilike.%${search}%`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as HistoryEntryWithDetails[], error: null };
}

/**
 * Get notification delivery rate
 */
export async function getDeliveryRate(options?: {
  fromDate?: Date;
  toDate?: Date;
}): Promise<{
  data: {
    total: number;
    delivered: number;
    rate: number;
  } | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('notification_history')
    .select('status');

  if (options?.fromDate) {
    query = query.gte('created_at', options.fromDate.toISOString());
  }

  if (options?.toDate) {
    query = query.lte('created_at', options.toDate.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  const total = data?.length || 0;
  const delivered = data?.filter(
    (item) => item.status === 'sent' || item.status === 'delivered'
  ).length || 0;

  return {
    data: {
      total,
      delivered,
      rate: total > 0 ? (delivered / total) * 100 : 0,
    },
    error: null,
  };
}
