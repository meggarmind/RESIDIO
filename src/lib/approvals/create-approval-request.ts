/**
 * Server-only helper that files an approval request.
 *
 * Deliberately NOT a server-action module (no directive): it only checks that a user is
 * signed in, so exposing it as a client-callable server action would let any authenticated
 * user (a resident included) insert arbitrary approval_requests rows and notify admins.
 * Callers are server actions that have already passed their own authorizePermission()
 * guard (billing/profiles.ts, houses/update-house.ts). See #560.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApprovalRequestType, ApprovalEntityType } from '@/types/database';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

export async function createApprovalRequest(params: {
  request_type: ApprovalRequestType;
  entity_type: ApprovalEntityType;
  entity_id: string;
  requested_changes: Record<string, unknown>;
  current_values: Record<string, unknown>;
  reason?: string;
}): Promise<{ success: boolean; request_id?: string; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Check for existing pending request for the same entity
  const { data: existing } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('entity_type', params.entity_type)
    .eq('entity_id', params.entity_id)
    .eq('request_type', params.request_type)
    .eq('status', 'pending')
    .single();

  if (existing) {
    return {
      success: false,
      error: 'A pending approval request already exists for this change',
    };
  }

  const { data, error } = await supabase
    .from('approval_requests')
    .insert({
      request_type: params.request_type,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      requested_changes: params.requested_changes,
      current_values: params.current_values,
      reason: params.reason || null,
      requested_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'approval_requests',
    entityId: data.id,
    entityDisplay: `${params.request_type.replace(/_/g, ' ')} request`,
    newValues: {
      request_type: params.request_type,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      requested_changes: params.requested_changes,
    },
  });

  // Notify admins of the new approval request
  await notifyAdmins({
    title: 'New Approval Request',
    body: `A new ${params.request_type.replace(/_/g, ' ')} request has been created and requires review.`,
    category: 'system',
    actionUrl: `/approvals?id=${data.id}`,
    priority: 'normal',
    requiredPermission: PERMISSIONS.APPROVALS_VIEW,
  });

  return { success: true, request_id: data.id, error: null };
}
