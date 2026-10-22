import { createAdminClient } from '@/lib/supabase/server';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { createSendPolicyFacts, evaluateSendPolicy } from '@/lib/whatsapp/send-policy';

export type ResidentSendResult = { sent: true } | { sent: false; reason: string };

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
  options: { seed: string; mediaUrls?: string[]; trackingId?: string }
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
