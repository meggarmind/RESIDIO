/**
 * Server-only helper that files an approval request on behalf of a resident acting over WhatsApp
 * (#816). The resident has no admin profile, so the request carries `requested_by_resident_id`
 * and no `requested_by`. Not a server action: it is reached only from the inbound webhook flows,
 * which have identified the resident by their verified number. Admins decide it in Approvals.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import type { ApprovalRequestType, ApprovalEntityType } from '@/types/database';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { recordAudit } from '@/lib/audit/recorder';
import { getApprovalHandler } from '@/lib/approvals/registry';
import { APPROVAL_EXPIRY_HOURS } from '@/lib/approvals/create-approval-request';

export async function createResidentApprovalRequest(params: {
  residentId: string;
  request_type: ApprovalRequestType;
  entity_type: ApprovalEntityType;
  entity_id: string;
  requested_changes: Record<string, unknown>;
  reason?: string;
}): Promise<{ success: true; request_id: string } | { success: false; duplicate: boolean; error: string }> {
  const handler = getApprovalHandler(params.request_type);
  if (!handler) return { success: false, duplicate: false, error: `Unsupported approval request type: ${params.request_type}` };
  const parsed = handler.schema.safeParse(params.requested_changes);
  if (!parsed.success) {
    return { success: false, duplicate: false, error: `Invalid requested changes for ${params.request_type}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}` };
  }

  // requested_by_resident_id is not in the generated types until migration 20261022000000 is applied.
  const { data, error } = await (createAdminClient() as unknown as SupabaseClient)
    .from('approval_requests')
    .insert({
      request_type: params.request_type,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      requested_changes: params.requested_changes,
      current_values: {},
      reason: params.reason ?? null,
      requested_by: null,
      requested_by_resident_id: params.residentId,
      expires_at: new Date(Date.now() + APPROVAL_EXPIRY_HOURS * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) {
    // The partial unique index allows one pending request per entity and type.
    return { success: false, duplicate: error?.code === '23505', error: error?.message ?? 'Approval request not created' };
  }

  await recordAudit(
    {
      action: 'CREATE',
      entityType: 'approval_requests',
      entityId: data.id,
      entityDisplay: `${params.request_type.replace(/_/g, ' ')} request`,
      newValues: { request_type: params.request_type, entity_type: params.entity_type, entity_id: params.entity_id, requested_changes: params.requested_changes },
    },
    { userId: null, residentId: params.residentId }
  );
  await notifyAdmins({
    title: 'New Approval Request',
    body: `A new ${params.request_type.replace(/_/g, ' ')} request has been created over WhatsApp and requires review.`,
    category: 'system',
    actionUrl: `/approvals?id=${data.id}`,
    priority: 'normal',
    requiredPermission: PERMISSIONS.APPROVALS_VIEW,
  });
  return { success: true, request_id: data.id };
}
