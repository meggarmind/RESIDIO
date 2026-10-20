import { createAdminClient } from '@/lib/supabase/server';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { isWhatsAppOptedIn } from '@/lib/whatsapp/opt-in';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';

export type ResidentSendResult = { sent: true } | { sent: false; reason: string };

/**
 * A system-initiated WhatsApp message to one resident, outside any reply (a payment outcome, a
 * clearance certificate copy). Needs the resident's opt-in for their number and follows the
 * communications override like any notification (#716). Never throws: callers decide what a
 * failed send means.
 */
export async function sendWhatsAppToResident(
  residentId: string,
  body: string,
  options: { seed: string; mediaUrls?: string[] }
): Promise<ResidentSendResult> {
  try {
    const { data: resident, error } = await createAdminClient().from('residents').select('phone_primary').eq('id', residentId).single();
    if (error || !resident) return { sent: false, reason: 'resident not found' };
    const phone = resident.phone_primary?.trim();
    if (!phone) return { sent: false, reason: 'no WhatsApp number' };
    if (!(await isWhatsAppOptedIn(residentId, phone))) return { sent: false, reason: 'not opted in' };

    const override = await resolveResidentOverride([residentId]);
    if (!override.ok) return { sent: false, reason: override.error };

    const result = await sendWhatsAppMessage(
      { to: phone, body, idempotencySeed: options.seed, ...(options.mediaUrls ? { mediaUrls: options.mediaUrls } : {}) },
      undefined,
      { residentOverride: override.residentOverride },
      { purpose: 'notification', residentId }
    );
    return result.success ? { sent: true } : { sent: false, reason: result.error || 'send failed' };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : 'send failed' };
  }
}
