import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { allocateWalletToInvoices } from '@/actions/billing/wallet';

/**
 * What an admin's decision does to a payment a resident reported over WhatsApp (#816 decisions 11, 13).
 * Approving makes it a real payment, exactly as if an admin had recorded it: status paid, verified,
 * credited to the wallet and allocated to invoices. Rejecting or letting it expire closes it as failed.
 * Neither is a server action; the approvals flow has already checked who may decide.
 */

export type SettleResult = { success: true } | { success: false; error: string };

// payment_records.whatsapp_report_key is not in the generated types until migration 20261022000000 is applied.
const db = () => createAdminClient() as unknown as SupabaseClient;

export async function settleReportedPayment(paymentId: string, verifierId: string): Promise<SettleResult> {
  const { data: payment, error } = await db()
    .from('payment_records')
    .select('id, resident_id, house_id, amount, payment_date, status, is_verified')
    .eq('id', paymentId)
    .maybeSingle();
  if (error || !payment) return { success: false, error: 'The reported payment was not found' };
  // Re-applying an approval that already landed must not credit the wallet twice.
  if (payment.status === 'paid' && payment.is_verified) return { success: true };
  if (payment.status !== 'pending') return { success: false, error: `The reported payment is ${payment.status}, not pending` };

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await db()
    .from('payment_records')
    .update({ status: 'paid', is_verified: true, verified_at: now, verified_by: verifierId })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (claimError || !claimed) return { success: false, error: 'The reported payment was changed by someone else' };

  const amount = Number(payment.amount);
  const allocation = await allocateWalletToInvoices(payment.resident_id, payment.house_id, String(payment.payment_date).slice(0, 10), {
    sourcePaymentId: paymentId,
    batchAmount: amount,
    batchType: 'payment_received',
    creditAmount: amount,
  });
  if (!allocation.success) {
    // Put it back so the approval can be retried without a half-settled payment.
    await db()
      .from('payment_records')
      .update({ status: 'pending', is_verified: false, verified_at: null, verified_by: null })
      .eq('id', paymentId)
      .eq('status', 'paid');
    return { success: false, error: `The wallet could not be credited: ${allocation.error}` };
  }
  return { success: true };
}

/** A rejected or expired report: closed as failed, and its key freed so the resident can report it again correctly. */
export async function closeReportedPayment(paymentId: string): Promise<void> {
  const { error } = await db()
    .from('payment_records')
    .update({ status: 'failed', whatsapp_report_key: null })
    .eq('id', paymentId)
    .eq('status', 'pending');
  if (error) console.error('[WhatsApp] Rejected payment report not closed:', { paymentId, error });
}
