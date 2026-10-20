import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { formatDay, formatNaira } from '@/lib/whatsapp/assistant-format';
import { closeReportedPayment } from '@/lib/whatsapp/payment-report-settlement';
import { sendWhatsAppToResident } from '@/lib/whatsapp/resident-send';

export type ResidentOutcome = 'approved' | 'rejected' | 'expired';

/**
 * Tells a resident how an admin decided what they asked for over WhatsApp (#816 decision 13). Runs
 * from the approvals flow after a request is approved, rejected or auto-rejected after 72 hours. It
 * respects the resident's opt-in but not the Reminders toggle, and never throws: the decision has
 * already been made and recorded.
 */
export async function notifyResidentOfApprovalOutcome(request: { id: string; request_type: string }, outcome: ResidentOutcome): Promise<void> {
  if (request.request_type !== 'whatsapp_payment_report') return;
  try {
    // requested_by_resident_id is not in the generated types until migration 20261022000000 is applied.
    const admin = createAdminClient() as unknown as SupabaseClient;
    const { data: approval } = await admin.from('approval_requests').select('entity_id, requested_by_resident_id').eq('id', request.id).maybeSingle();
    if (!approval?.requested_by_resident_id) return;

    const { data: payment } = await admin.from('payment_records').select('amount, payment_date').eq('id', approval.entity_id).maybeSingle();
    if (outcome !== 'approved') await closeReportedPayment(approval.entity_id);
    if (!payment) return;

    const what = `Your payment of ${formatNaira(Number(payment.amount))} on ${formatDay(String(payment.payment_date))}`;
    const body = outcome === 'approved' ? `${what} was confirmed.` : `${what} could not be confirmed. Contact the estate office.`;
    const sent = await sendWhatsAppToResident(approval.requested_by_resident_id, body, { seed: `approval:${request.id}:${outcome}` });
    if (!sent.sent) console.error('[WhatsApp] Payment outcome not sent:', { requestId: request.id, outcome, reason: sent.reason });
  } catch (error) {
    console.error('[WhatsApp] Payment outcome failed:', { requestId: request.id, outcome, error });
  }
}
