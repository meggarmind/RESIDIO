import { createAdminClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import { DOCUMENTS_BUCKET, issueClearanceCertificate } from '@/lib/clearance/issue-certificate';
import { formatNaira, lagosDateString } from '@/lib/whatsapp/assistant-format';
import { sendWhatsAppToResident } from '@/lib/whatsapp/resident-send';
import { storeChatPdf } from '@/lib/whatsapp/statement-delivery';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import type { ClearanceCertificate } from '@/actions/residents/move-out-renter';

/**
 * What approving a clearance certificate request does (#816 decisions 15, 21, 22): re-check that nothing
 * is owed, issue the certificate, and send the PDF to the resident in chat. The copies to the recipient
 * group go out inside issueClearanceCertificate, for every certificate however it was issued.
 */

export type ClearanceApprovalResult = { success: true; warning?: string } | { success: false; error: string };

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

/** Unpaid and part-paid invoices for the resident and property, as What I owe counts them. */
export async function getOutstanding(residentId: string, houseId: string): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('invoices')
    .select('amount_due, amount_paid')
    .eq('resident_id', residentId)
    .eq('house_id', houseId)
    .in('status', ['unpaid', 'partially_paid']);
  if (error) throw error;
  return (data || []).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.amount_due) - Number(invoice.amount_paid)), 0);
}

/** `CLR-202610-3F9A1C`: the same request always gets the same number, so a re-applied approval cannot issue twice. */
export function certificateNumberFor(requestId: string, now: Date): string {
  const day = lagosDateString(now);
  return `CLR-${day.slice(0, 4)}${day.slice(5, 7)}-${requestId.replaceAll('-', '').slice(0, 6).toUpperCase()}`;
}

export async function issueApprovedClearance(
  request: { id: string; entity_id: string; requested_by_resident_id?: string | null },
  approverId: string,
  now = new Date()
): Promise<ClearanceApprovalResult> {
  const residentId = request.requested_by_resident_id;
  if (!residentId) return { success: false, error: 'This request has no resident to issue the certificate to' };
  const houseId = request.entity_id;
  const admin = createAdminClient();

  const [{ data: resident }, { data: house }] = await Promise.all([
    admin.from('residents').select('first_name, last_name, resident_code, phone_primary').eq('id', residentId).maybeSingle(),
    admin.from('houses').select('house_number, short_name, street:streets(name)').eq('id', houseId).maybeSingle(),
  ]);
  if (!resident || !house) return { success: false, error: 'The resident or the property could not be found' };

  const houseAddress = `${house.short_name || house.house_number}, ${one(house.street as { name: string } | { name: string }[] | null)?.name ?? ''}`.replace(/, $/, '');
  const residentName = `${resident.first_name} ${resident.last_name}`;

  // Days may have passed since the resident asked; a certificate says nothing is owed now.
  const outstanding = await getOutstanding(residentId, houseId);
  if (outstanding > 0) {
    return { success: false, error: `${residentName} now owes ${formatNaira(outstanding)} on ${houseAddress}. Reject this request, or approve it once it is paid.` };
  }

  const today = lagosDateString(now);
  const certificate: ClearanceCertificate = {
    id: crypto.randomUUID(),
    residentId,
    residentName,
    residentCode: resident.resident_code,
    houseId,
    houseAddress,
    clearanceDate: today,
    validUntil: today,
    validityDays: 0,
    destination: 'leaving_estate',
    certificateNumber: certificateNumberFor(request.id, now),
    status: 'confirmed',
    createdBy: approverId,
    createdAt: now.toISOString(),
  };

  const issued = await issueClearanceCertificate({ certificate, variant: 'financial', issuedBy: approverId });
  if (issued.alreadyIssued) return { success: true };

  await logAudit({
    action: 'CREATE',
    entityType: 'clearance_certificate',
    entityId: certificate.id,
    entityDisplay: `Clearance certificate ${certificate.certificateNumber} for ${residentName}`,
    newValues: { ...certificate } as Record<string, unknown>,
    description: `Issued from the clearance request approved over WhatsApp (approval request ${request.id})`,
    metadata: { approval_request_id: request.id },
  });

  // The certificate exists; a failed delivery to the resident is logged and never undoes it.
  try {
    const body = `Your clearance certificate for ${houseAddress} is attached.`;
    const phone = resident.phone_primary ? normalizePhoneNumber(resident.phone_primary) : null;
    if (phone) {
      const trackingId = `clearance:${request.id}`;
      const url = await storeChatPdf(
        'clearance',
        { residentId, phoneNumber: phone, houseId, label: 'clearance', fromDate: today, toDate: today, rowCount: 1, inboundMessageId: trackingId, replyText: body },
        async () => issued.pdf
      );
      const sent = await sendWhatsAppToResident(residentId, body, { seed: `clearance:${request.id}`, mediaUrls: [url], trackingId, deferMedia: [{ bucket: DOCUMENTS_BUCKET, path: issued.filePath }], notice: 'clearance' });
      if (!sent.sent) {
        console.error('[clearance] Certificate not sent to the resident:', { requestId: request.id, reason: sent.reason });
        return { success: true, warning: `The certificate was issued, but the WhatsApp copy to the resident ${sent.deferred ? 'is held back' : 'was not sent'}: ${sent.reason}` };
      }
    }
  } catch (error) {
    console.error('[clearance] Certificate delivery failed:', { requestId: request.id, error });
  }
  return { success: true };
}
