import { createResidentApprovalRequest } from '@/lib/approvals/create-resident-approval-request';

export type ClearanceRequestResult = { status: 'requested'; requestId: string } | { status: 'duplicate' };

/**
 * A resident asks for a clearance certificate over WhatsApp (#816 decision 15): an approval request
 * for the property, decided by an admin in Approvals. The caller has already checked that nothing is
 * owed. One request per property can wait at a time. The request is audited with the resident as actor.
 */
export async function requestClearanceCertificate(input: {
  residentId: string;
  residentName: string;
  houseId: string;
  houseLabel: string;
}): Promise<ClearanceRequestResult> {
  const request = await createResidentApprovalRequest({
    residentId: input.residentId,
    request_type: 'clearance_certificate_request',
    entity_type: 'house',
    entity_id: input.houseId,
    requested_changes: { property: input.houseLabel, resident: input.residentName },
    reason: 'Requested over WhatsApp',
  });
  if (request.success) return { status: 'requested', requestId: request.request_id };
  if (request.duplicate) return { status: 'duplicate' };
  throw new Error(`Clearance request not filed: ${request.error}`);
}
