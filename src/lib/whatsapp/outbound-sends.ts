import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { createAdminClient } from '@/lib/supabase/server';
import type { CommsPurpose } from '@/lib/comms-override/types';

/**
 * Outbound WhatsApp sends and their provider delivery status (#839).
 *
 * A successful send call means the provider ACCEPTED the message, not that it
 * arrived: Chatmaid reports `sent`, `delivered` or `failed` later by webhook.
 * Each accepted send is stored by its provider message id so that webhook can
 * be tied back to the resident, the phone and the inbound message it answered.
 */

/** An exempt comms purpose (a reply to an inbound message), or a proactive notification. */
export type OutboundSendPurpose = CommsPurpose | 'notification';

/**
 * What a caller knows about a send; the seam adds the provider and message id.
 * A send with a comms purpose is recorded under that purpose, so only the
 * sanctioned call sites name the exemption.
 */
export interface OutboundSendTracking {
  purpose?: 'notification';
  residentId?: string | null;
  inboundMessageId?: string;
  notificationQueueId?: string;
}

export type OutboundDeliveryStatus = 'sent' | 'delivered' | 'failed';

/** Repeated failures that raise an admin notification: this many within the window. */
export const OUTBOUND_FAILURE_ALERT_THRESHOLD = 3;
export const OUTBOUND_FAILURE_ALERT_WINDOW_MINUTES = 10;
/** A Chatmaid send still `pending` this long after acceptance is treated as failed. */
export const OUTBOUND_PENDING_TIMEOUT_MINUTES = 15;

// Status events can arrive out of order; a status only moves forward, so a
// late `sent` never overwrites `delivered` or `failed`. `failed` may repeat so
// a retried event whose alert failed still finds its send.
const PRIOR_STATUSES: Record<OutboundDeliveryStatus, string[]> = {
  sent: ['pending'],
  delivered: ['pending', 'sent'],
  failed: ['pending', 'sent', 'failed'],
};

/** Stores an accepted send. Never throws: the message already went out. */
export async function recordOutboundSend(
  input: Omit<OutboundSendTracking, 'purpose'> & { purpose: OutboundSendPurpose; provider: string; providerMessageId: string; phoneNumber: string }
): Promise<void> {
  try {
    const { error } = await createAdminClient().from('whatsapp_outbound_sends').insert({
      provider: input.provider,
      provider_message_id: input.providerMessageId,
      purpose: input.purpose,
      resident_id: input.residentId ?? null,
      phone_number: input.phoneNumber,
      inbound_message_id: input.inboundMessageId ?? null,
      notification_queue_id: input.notificationQueueId ?? null,
    });
    if (error) throw error;
  } catch (error) {
    // Ids only: the row carries a phone number.
    console.error('[whatsapp-outbound] Failed to record an outbound send:', {
      provider: input.provider,
      providerMessageId: input.providerMessageId,
      error,
    });
  }
}

/**
 * Applies a provider status event to its stored send. Returns whether a stored
 * send moved; throws on a database error so the webhook asks for a retry.
 */
export async function updateOutboundSendStatus(
  provider: string,
  providerMessageId: string,
  status: OutboundDeliveryStatus,
  failure?: { code: string | null; message: string | null }
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('whatsapp_outbound_sends')
    .update({
      status,
      status_updated_at: new Date().toISOString(),
      ...(status === 'failed' ? { error_code: failure?.code ?? null, error_message: failure?.message ?? null } : {}),
    })
    .eq('provider', provider)
    .eq('provider_message_id', providerMessageId)
    .in('status', PRIOR_STATUSES[status])
    .select('id');
  if (error) throw error;
  return (data || []).length > 0;
}

/** Stored sends that failed within the last `windowMinutes`. Throws on a database error. */
export async function countRecentOutboundFailures(
  windowMinutes = OUTBOUND_FAILURE_ALERT_WINDOW_MINUTES
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count, error } = await createAdminClient()
    .from('whatsapp_outbound_sends')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('status_updated_at', since);
  if (error) throw error;
  return count || 0;
}

/**
 * Claims Chatmaid sends still `pending` past the timeout that no earlier sweep
 * has alerted on, and returns how many were claimed. Only Chatmaid reports
 * delivery status, so other providers' sends are never treated as stale.
 */
export async function claimStalePendingSends(
  timeoutMinutes = OUTBOUND_PENDING_TIMEOUT_MINUTES
): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
  const { data, error } = await createAdminClient()
    .from('whatsapp_outbound_sends')
    .update({ pending_alerted_at: new Date().toISOString() })
    .eq('provider', 'chatmaid')
    .eq('status', 'pending')
    .is('pending_alerted_at', null)
    .lt('created_at', cutoff)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

/**
 * Alerts admins once about Chatmaid sends accepted but never confirmed (#839
 * point 4): silence from the provider is also a failure. Run by the
 * notification cron. Returns how many sends the alert covered.
 */
export async function alertStalePendingSends(): Promise<number> {
  const stale = await claimStalePendingSends();
  if (stale === 0) return 0;
  // shortcut: sends are claimed before the alert, so a failed alert is not retried (they still list in the console); add a retry if alerts prove unreliable.
  const result = await notifyAdmins({
    title: 'WhatsApp messages were never confirmed as sent',
    body:
      `${stale} WhatsApp message(s) were accepted by Chatmaid more than ${OUTBOUND_PENDING_TIMEOUT_MINUTES} minutes ago ` +
      'with no sent or failed report. Residents may not have received them. Check the WhatsApp operations console ' +
      'and the handset in the Chatmaid dashboard.',
    category: 'system',
    priority: 'high',
    actionUrl: '/settings/whatsapp',
    metadata: { source: 'whatsapp_outbound_sweep', stale },
  });
  if (!result.success) throw new Error(result.error || 'Admin notification failed');
  return stale;
}

/** Replaces anything that looks like a phone number, for log text (#839 point 5). */
export function stripPhoneNumbers(text: string): string {
  return text.replace(/\+?\d[\d\s().-]{5,}\d/g, '[number]');
}
