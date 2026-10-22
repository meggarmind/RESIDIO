import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { createSendPolicyFacts, evaluateSendPolicy } from '@/lib/whatsapp/send-policy';

/** `deferred`: held back by a cap and queued to send automatically (#1044), not lost. */
export type ResidentSendResult = { sent: true } | { sent: false; reason: string; deferred?: true };

/** A stored file the queue signs a fresh URL for at send time; a signed URL would expire before the next day. */
export interface DeferredMedia { bucket: string; path: string }

/** Metadata key marking a queue row as a system message to a resident rather than a template notification. */
export const RESIDENT_SEND_METADATA_KEY = 'whatsapp_resident_send';
/** The clearance copy row the queue marks sent or failed once it is delivered or finally fails. */
export interface ClearanceCopyRef { documentId: string; recipientId: string }
export interface ResidentSendPayload { seed: string; media?: DeferredMedia[]; trackingId?: string; clearanceCopy?: ClearanceCopyRef }

const dedupKey = (seed: string) => `resident-send:${seed}`;

async function moveClearanceCopy(metadata: Record<string, unknown> | null | undefined, from: string, status: string, error: string | null): Promise<void> {
  const copy = (metadata?.[RESIDENT_SEND_METADATA_KEY] as ResidentSendPayload | undefined)?.clearanceCopy;
  if (!copy) return;
  // clearance_certificate_copies is not in the generated types until its migration is applied.
  const { error: updateError } = await (createAdminClient() as unknown as SupabaseClient)
    .from('clearance_certificate_copies')
    .update({ status, error, updated_at: new Date().toISOString() })
    .eq('document_id', copy.documentId)
    .eq('recipient_resident_id', copy.recipientId)
    .eq('status', from);
  if (updateError) console.error('[WhatsApp] Clearance copy status not updated:', { copy, updateError });
}

/**
 * Moves a clearance copy the cap held back (#1044) out of 'scheduled' once its queue row ends:
 * 'sent' when `error` is null, otherwise 'failed' with the reason so the console lists it for retry.
 */
export async function settleClearanceCopy(metadata: Record<string, unknown> | null | undefined, error: string | null): Promise<void> {
  await moveClearanceCopy(metadata, 'scheduled', error === null ? 'sent' : 'failed', error);
}

/** A failed queue row sent again by an admin puts its failed clearance copy back to 'scheduled' until it ends again. */
export async function rescheduleClearanceCopy(metadata: Record<string, unknown> | null | undefined): Promise<void> {
  await moveClearanceCopy(metadata, 'failed', 'scheduled', null);
}

/** True while a deferred send for this seed is in one of `statuses`; by default waiting or already sent, so a second one is never queued. */
export async function hasQueuedResidentSend(seed: string, statuses: string[] = ['pending', 'processing', 'sent']): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('notification_queue')
    .select('id')
    .eq('deduplication_key', dedupKey(seed))
    .in('status', statuses)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function deferResidentSend(
  residentId: string,
  phone: string,
  body: string,
  options: { seed: string; deferMedia?: DeferredMedia[]; trackingId?: string; clearanceCopy?: ClearanceCopyRef },
  decision: { reason: string; message: string }
): Promise<ResidentSendResult> {
  // Lazy: the queue imports the sender, which imports this module's payload type.
  const [{ addToQueue, PRIORITY }, { resolveDeferRetryAt }] = await Promise.all([
    import('@/lib/notifications/queue'),
    import('@/lib/notifications/send'),
  ]);
  const when = decision.reason === 'burst_limit_reached' ? 'in a few minutes' : 'tomorrow, after 00:00 UTC';
  const scheduled = { sent: false, deferred: true, reason: `${decision.message}. It is scheduled and will send automatically ${when}` } as const;
  // The queue's only unique key is for invoice reminders, so look first: one send per seed.
  if (await hasQueuedResidentSend(options.seed)) return scheduled;
  const retryAt = await resolveDeferRetryAt(decision.reason);
  const queued = await addToQueue({
    recipient_id: residentId,
    recipient_phone: phone,
    channel: 'whatsapp',
    body,
    priority: PRIORITY.HIGH,
    scheduled_for: retryAt,
    deduplication_key: dedupKey(options.seed),
    metadata: {
      [RESIDENT_SEND_METADATA_KEY]: {
        seed: options.seed,
        ...(options.deferMedia ? { media: options.deferMedia } : {}),
        ...(options.trackingId ? { trackingId: options.trackingId } : {}),
        ...(options.clearanceCopy ? { clearanceCopy: options.clearanceCopy } : {}),
      } satisfies ResidentSendPayload,
    },
  });
  if (!queued.success && !queued.isDuplicate) return { sent: false, reason: `${decision.message}; it could not be scheduled: ${queued.error}` };
  return scheduled;
}

/**
 * A system-initiated WhatsApp message to one resident, outside any reply (a payment outcome, a
 * clearance certificate copy). Obeys the same send policy as queued notifications (master switch,
 * pilot audience, daily and burst caps, opt-in; #1037), then follows the communications override
 * like any notification (#716). Never throws: callers decide what a
 * failed send means.
 */
export async function sendWhatsAppToResident(
  residentId: string,
  body: string,
  options: {
    seed: string;
    mediaUrls?: string[];
    trackingId?: string;
    /** The stored file behind `mediaUrls`. Without it a send with media is not deferred (its URL would expire). */
    deferMedia?: DeferredMedia[];
    clearanceCopy?: ClearanceCopyRef;
  }
): Promise<ResidentSendResult> {
  try {
    const { data: resident, error } = await createAdminClient().from('residents').select('phone_primary').eq('id', residentId).single();
    if (error || !resident) return { sent: false, reason: 'resident not found' };
    const phone = resident.phone_primary?.trim();
    if (!phone) return { sent: false, reason: 'no WhatsApp number' };
    const decision = await evaluateSendPolicy(
      { recipientId: residentId, recipientPhone: phone, metadata: null, freeForm: true },
      createSendPolicyFacts()
    );
    if (decision.outcome === 'defer' && (!options.mediaUrls || options.deferMedia)) {
      return await deferResidentSend(residentId, phone, body, options, decision);
    }
    if (decision.outcome !== 'allow') return { sent: false, reason: decision.message };

    const override = await resolveResidentOverride([residentId]);
    if (!override.ok) return { sent: false, reason: override.error };

    const result = await sendWhatsAppMessage(
      { to: phone, body, idempotencySeed: options.seed, ...(options.mediaUrls ? { mediaUrls: options.mediaUrls } : {}) },
      undefined,
      { residentOverride: override.residentOverride },
      // trackingId ties a failed send back to its stored file, so the one-retry with a fresh URL finds it (#804).
      { purpose: 'notification', residentId, ...(options.trackingId ? { inboundMessageId: options.trackingId } : {}) }
    );
    return result.success ? { sent: true } : { sent: false, reason: result.error || 'send failed' };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : 'send failed' };
  }
}
