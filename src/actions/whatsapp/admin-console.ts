'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { createAdminClient } from '@/lib/supabase/server';

type Result<T> = { success: boolean; data: T | null; error: string | null };

export async function getWhatsAppSessions(): Promise<Result<unknown[]>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  const { data, error } = await createAdminClient()
    .from('whatsapp_sessions')
    .select('id, phone_number, resident_id, current_node, pin_authenticated, selected_house_id, expires_at, created_at, updated_at, resident:residents(first_name, last_name, resident_code), house:houses(house_number, street:streets(name))')
    .order('updated_at', { ascending: false });

  return { success: !error, data: data || [], error: error?.message || null };
}

export async function getWhatsAppDisclosureLogs(): Promise<Result<unknown[]>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  const { data, error } = await createAdminClient()
    .from('whatsapp_disclosure_logs')
    .select('id, resident_id, phone_number, house_id, menu_item, pin_authenticated, created_at, resident:residents(first_name, last_name, resident_code), house:houses(house_number, street:streets(name))')
    .order('created_at', { ascending: false })
    .limit(500);

  return { success: !error, data: data || [], error: error?.message || null };
}

export type WhatsAppHealth = {
  inboundToday: number;
  outboundToday: number;
  deliveryFailuresToday: number;
  templateErrorsToday: number;
  capLimitEventsToday: number;
};

export async function getWhatsAppHealth(): Promise<Result<WhatsAppHealth>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const start = startOfDay.toISOString();
  const client = createAdminClient();
  const [inbound, outbound, historyFailures, queueFailures, templateErrors, capLimitEvents] = await Promise.all([
    client.from('whatsapp_processed_messages').select('id', { count: 'exact', head: true }).gte('received_at', start),
    client.from('notification_history').select('id', { count: 'exact', head: true }).eq('channel', 'whatsapp').eq('status', 'sent').gte('sent_at', start),
    client.from('notification_history').select('id', { count: 'exact', head: true }).eq('channel', 'whatsapp').eq('status', 'failed').gte('created_at', start),
    client.from('notification_queue').select('id', { count: 'exact', head: true }).eq('channel', 'whatsapp').eq('status', 'failed').gte('created_at', start),
    client.from('notification_queue').select('id', { count: 'exact', head: true }).eq('channel', 'whatsapp').gte('created_at', start).ilike('error_message', '%template%'),
    client.from('notification_queue').select('id', { count: 'exact', head: true }).eq('channel', 'whatsapp').gte('created_at', start).or('error_message.ilike.%cap%,error_message.ilike.%limit%'),
  ]);

  const firstError = [inbound, outbound, historyFailures, queueFailures, templateErrors, capLimitEvents].find((result) => result.error)?.error;
  if (firstError) return { success: false, data: null, error: firstError.message };
  return {
    success: true,
    data: {
      inboundToday: inbound.count || 0,
      outboundToday: outbound.count || 0,
      deliveryFailuresToday: historyFailures.count || 0,
      templateErrorsToday: templateErrors.count || 0,
      capLimitEventsToday: capLimitEvents.count || 0,
    },
    error: null,
  };
}
