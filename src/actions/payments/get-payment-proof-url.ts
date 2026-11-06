'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const PAYMENT_PROOFS_BUCKET = 'payment-proofs';
/** Short-lived: the link is opened at once and must not stay usable if it is shared. */
const PROOF_URL_SECONDS = 5 * 60;

/**
 * A short-lived signed URL for the receipt attached to a payment (#1455), for "View receipt" on the
 * approval queue and the payment detail page. A read: no audit row, as for document views.
 *
 * Guarded by `payments.update`, the permission the `payment-proofs` storage policy already requires
 * (20260907000000, #213: `payments.view` would admit every resident's proof to more roles). The URL is
 * signed with the caller's own client, so that policy applies too.
 */
export async function getPaymentProofUrl(paymentId: string): Promise<{ url: string | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.PAYMENTS_UPDATE);
  if (!auth.authorized) return { url: null, error: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();
  const { data: payment, error } = await supabase.from('payment_records').select('proof_url').eq('id', paymentId).maybeSingle();
  if (error) {
    console.error('[getPaymentProofUrl] Payment lookup failed:', { paymentId, error });
    return { url: null, error: 'Could not load the payment' };
  }
  if (!payment?.proof_url) return { url: null, error: 'No receipt is attached to this payment' };

  const { data: signed, error: signError } = await supabase.storage
    .from(PAYMENT_PROOFS_BUCKET)
    .createSignedUrl(payment.proof_url, PROOF_URL_SECONDS);
  if (signError || !signed?.signedUrl) {
    console.error('[getPaymentProofUrl] Signed URL failed:', { paymentId, error: signError });
    return { url: null, error: 'Could not open the receipt' };
  }
  return { url: signed.signedUrl, error: null };
}
