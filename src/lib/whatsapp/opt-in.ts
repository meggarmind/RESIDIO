import { normalizePhoneNumber } from '@/lib/sms/termii';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Enqueue-time WhatsApp consent check. Mirrors the send-time check in
 * src/lib/notifications/send.ts (same table, same normalisation) so
 * non-opted-in residents never get a queue row that is bound to fail.
 * Fails closed: a query error returns false.
 */
export async function isWhatsAppOptedIn(residentId: string, phone: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('whatsapp_optins')
    .select('id')
    .eq('resident_id', residentId)
    .eq('phone_number', normalizePhoneNumber(phone))
    .eq('opted_in', true)
    .is('deactivated_at', null)
    .maybeSingle();

  if (error) {
    console.error('[whatsapp] opt-in lookup failed; treating as not opted in', {
      residentId,
      error,
    });
    return false;
  }

  return Boolean(data);
}
