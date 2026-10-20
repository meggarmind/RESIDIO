'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { OUTBOUND_PENDING_TIMEOUT_MINUTES } from '@/lib/whatsapp/outbound-sends';
import { logAudit } from '@/lib/audit/logger';
import { retryClearanceCopy } from '@/lib/clearance/issue-certificate';
import { revalidatePath } from 'next/cache';

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
    .select('id, resident_id, phone_number, house_id, menu_item, channel, pin_authenticated, created_at, resident:residents(first_name, last_name, resident_code), house:houses(house_number, street:streets(name))')
    .order('created_at', { ascending: false })
    .limit(500);

  return { success: !error, data: data || [], error: error?.message || null };
}

/**
 * "Statement requested, no email" (#804 decision 24): residents who asked on WhatsApp for a
 * statement too long for chat and have no email on file. A row clears once the email is added
 * and the statement is queued.
 */
export async function getWhatsAppStatementFlags(): Promise<Result<unknown[]>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  // whatsapp_statement_requests is not in the generated types until its migration is applied.
  const { data, error } = await (createAdminClient() as unknown as SupabaseClient)
    .from('whatsapp_statement_requests')
    .select('id, phone_number, period, from_date, to_date, row_count, created_at, resident:residents(first_name, last_name, resident_code), house:houses(house_number, street:streets(name))')
    .eq('status', 'awaiting_email')
    .order('created_at', { ascending: false })
    .limit(200);

  return { success: !error, data: data || [], error: error?.message || null };
}

/**
 * Clearance certificate copies that did not reach a member of the recipient group (#816 decision 24):
 * not opted in, no number, or the provider refused. Each can be retried.
 */
export async function getWhatsAppClearanceCopyFailures(): Promise<Result<unknown[]>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  // clearance_certificate_copies is not in the generated types until its migration is applied.
  const { data, error } = await (createAdminClient() as unknown as SupabaseClient)
    .from('clearance_certificate_copies')
    .select('id, error, attempts, updated_at, recipient:residents(first_name, last_name, resident_code), document:documents(title)')
    .eq('status', 'failed')
    .order('updated_at', { ascending: false })
    .limit(200);

  return { success: !error, data: data || [], error: error?.message || null };
}

/** Sends a failed clearance certificate copy again, with a fresh link to the saved certificate. */
export async function retryWhatsAppClearanceCopy(copyId: string): Promise<Result<null>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  let outcome: Awaited<ReturnType<typeof retryClearanceCopy>>;
  try {
    outcome = await retryClearanceCopy(copyId);
  } catch (error) {
    console.error('[WhatsApp] Clearance copy retry failed:', { copyId, error });
    return { success: false, data: null, error: 'The copy could not be retried. Try again in a few minutes.' };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'documents',
    entityId: copyId,
    entityDisplay: 'Clearance certificate copy',
    newValues: { retried: true, sent: outcome.sent, ...(outcome.sent ? {} : { reason: outcome.reason }) },
    description: 'Retried a clearance certificate copy from the WhatsApp console',
  });
  revalidatePath('/settings/whatsapp');
  return outcome.sent ? { success: true, data: null, error: null } : { success: false, data: null, error: `Not sent: ${outcome.reason}` };
}

/**
 * Recent sends residents may not have received (#839): failed by the provider,
 * or Chatmaid sends still unconfirmed past the pending timeout.
 */
export async function getWhatsAppDeliveryProblems(): Promise<Result<unknown[]>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const staleBefore = new Date(Date.now() - OUTBOUND_PENDING_TIMEOUT_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await createAdminClient()
    .from('whatsapp_outbound_sends')
    .select('id, provider, purpose, phone_number, inbound_message_id, status, error_code, error_message, created_at, status_updated_at, resident:residents(first_name, last_name, resident_code)')
    .gte('created_at', since)
    .or(`status.eq.failed,and(status.eq.pending,provider.eq.chatmaid,created_at.lt.${staleBefore})`)
    .order('created_at', { ascending: false })
    .limit(200);

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
