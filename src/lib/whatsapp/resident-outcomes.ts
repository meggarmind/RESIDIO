import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { formatDay, formatNaira } from '@/lib/whatsapp/assistant-format';
import { closeReportedPayment } from '@/lib/whatsapp/payment-report-settlement';
import { sendWhatsAppToResident } from '@/lib/whatsapp/resident-send';

/** " It paid 12 Palm Close and 4 Cedar Way." from the invoices the payment settled; empty when none (#1073 decision 4). */
async function housesPaid(admin: SupabaseClient, paymentId: string): Promise<string> {
  const { data } = await admin
    .from('wallet_payment_batches')
    .select('wallet_payment_batch_items(invoice:invoices(house:houses(house_number, short_name, street:streets(name))))')
    .eq('source_payment_id', paymentId)
    .maybeSingle();
  type House = { house_number: string; short_name: string | null; street: { name: string } | { name: string }[] | null };
  const first = <T,>(value: T | T[] | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
  const labels = new Set<string>();
  for (const item of (data?.wallet_payment_batch_items ?? []) as unknown as { invoice: unknown }[]) {
    const house = first(first(item.invoice as { house: House | House[] | null } | null)?.house);
    if (house) labels.add(house.short_name || `${house.house_number}, ${first(house.street)?.name || 'Estate'}`);
  }
  const list = [...labels];
  if (list.length === 0) return '';
  return ` It paid ${list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`}.`;
}

export type ResidentOutcome = 'approved' | 'rejected' | 'expired';

/**
 * Tells a resident how an admin decided what they asked for over WhatsApp (#816 decision 13): a payment
 * they reported, or a clearance certificate they asked for. Runs
 * from the approvals flow after a request is approved, rejected or auto-rejected after 72 hours. It
 * respects the resident's opt-in but not the Reminders toggle, and never throws: the decision has
 * already been made and recorded. Returns why a WhatsApp message was not sent, for the deciding admin.
 */
export async function notifyResidentOfApprovalOutcome(request: { id: string; request_type: string }, outcome: ResidentOutcome): Promise<string | undefined> {
  if (request.request_type !== 'whatsapp_payment_report' && request.request_type !== 'clearance_certificate_request') return;
  try {
    // requested_by_resident_id is not in the generated types until migration 20261022000000 is applied.
    const admin = createAdminClient() as unknown as SupabaseClient;
    const { data: approval } = await admin.from('approval_requests').select('entity_id, requested_by_resident_id, requested_changes').eq('id', request.id).maybeSingle();
    if (!approval?.requested_by_resident_id) return;

    if (request.request_type === 'clearance_certificate_request') {
      // Approval sends the certificate itself (issueApprovedClearance); only a refusal needs telling.
      if (outcome === 'approved') return;
      const property = (approval.requested_changes as { property?: string } | null)?.property ?? 'your property';
      const sent = await sendWhatsAppToResident(approval.requested_by_resident_id, `Your clearance certificate request for ${property} was not approved. Contact the estate office.`, { seed: `approval:${request.id}:${outcome}` });
      if (!sent.sent) console.error('[WhatsApp] Clearance outcome not sent:', { requestId: request.id, outcome, reason: sent.reason });
      return sent.sent ? undefined : `WhatsApp message to the resident ${sent.deferred ? 'is held back' : 'was not sent'}: ${sent.reason}`;
    }

    const { data: payment } = await admin.from('payment_records').select('amount, payment_date').eq('id', approval.entity_id).maybeSingle();
    if (outcome !== 'approved') await closeReportedPayment(approval.entity_id);
    if (!payment) return;

    const what = `Your payment of ${formatNaira(Number(payment.amount))} on ${formatDay(String(payment.payment_date))}`;
    const paid = outcome === 'approved' ? await housesPaid(admin, approval.entity_id) : '';
    const body = outcome === 'approved' ? `${what} was confirmed.${paid}` : `${what} could not be confirmed. Contact the estate office.`;
    const sent = await sendWhatsAppToResident(approval.requested_by_resident_id, body, {
      seed: `approval:${request.id}:${outcome}`,
      notice: outcome === 'approved' ? 'payment_confirmed' : 'payment_not_confirmed',
    });
    if (!sent.sent) console.error('[WhatsApp] Payment outcome not sent:', { requestId: request.id, outcome, reason: sent.reason });
    return sent.sent ? undefined : `WhatsApp message to the resident ${sent.deferred ? 'is held back' : 'was not sent'}: ${sent.reason}`;
  } catch (error) {
    console.error('[WhatsApp] Payment outcome failed:', { requestId: request.id, outcome, error });
  }
}
