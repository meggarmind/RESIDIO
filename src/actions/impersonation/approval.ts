'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type {
  ApprovalRequest,
  ImpersonationApprovalData,
  ImpersonationSessionWithDetails,
} from '@/types/database';

// =====================================================
// Impersonation Approval Workflow Actions (DEV-75)
// =====================================================

type ImpersonationApprovalRequest = Omit<ApprovalRequest, 'requested_changes'> & {
  requested_changes: ImpersonationApprovalData;
  requester?: {
    id: string;
    full_name: string;
    email: string;
  };
};

/**
 * The impersonation maker-checker workflow was built on the approval request
 * type `impersonation_request`, which has never existed in the
 * `approval_request_type` Postgres enum. Every insert was rejected at runtime,
 * so no `approval_requests` row of this type has ever been written, and every
 * query filtering on it can only return nothing (#107).
 *
 * These actions therefore say so explicitly instead of issuing inserts that
 * always fail and reads that always come back empty. Restoring the workflow
 * requires the enum value to exist, which is an owner decision tracked as #306.
 *
 * Note: none of the authorization checks below were changed. Who may call each
 * action, and what an unauthorized caller is told, is exactly as before.
 */
const IMPERSONATION_APPROVALS_UNAVAILABLE =
  'Impersonation approval requests are unavailable: the request type does not ' +
  'exist in the database, so no such request can be created or found. ' +
  'Tracked as issue #306.';

/**
 * Create an impersonation approval request
 * Used by non-super admins who need approval to impersonate
 */
export async function createImpersonationApprovalRequest(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature preserved: callers are unchanged, but no request of this type can exist (#306)
  _residentId: string, _reason?: string
): Promise<{
  success: boolean;
  data?: ImpersonationApprovalRequest;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get profile with impersonation_enabled check
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, impersonation_enabled')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return { success: false, error: 'Profile not found' };
  }

  if (!profile.impersonation_enabled) {
    return { success: false, error: 'Impersonation is not enabled for your account' };
  }

  // Fail closed: no `impersonation_request` row can be inserted.
  return { success: false, error: IMPERSONATION_APPROVALS_UNAVAILABLE };
}

/**
 * Get pending impersonation requests that the current user can approve
 */
export async function getPendingImpersonationApprovals(): Promise<{
  success: boolean;
  data?: ImpersonationApprovalRequest[];
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.IMPERSONATION_APPROVE_REQUESTS);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  // No row of this type can exist, so the list is empty by construction.
  return { success: true, data: [] };
}

/**
 * Approve an impersonation request
 */
export async function approveImpersonationRequest(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature preserved: callers are unchanged, but no request of this type can exist (#306)
  _requestId: string, _note?: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.IMPERSONATION_APPROVE_REQUESTS);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  // Nothing to approve: no request of this type can exist.
  return { success: false, error: IMPERSONATION_APPROVALS_UNAVAILABLE };
}

/**
 * Deny an impersonation request
 */
export async function denyImpersonationRequest(
  _requestId: string, reason: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.IMPERSONATION_APPROVE_REQUESTS);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  if (!reason || reason.trim().length === 0) {
    return { success: false, error: 'A reason is required when denying a request' };
  }

  // Nothing to deny: no request of this type can exist.
  return { success: false, error: IMPERSONATION_APPROVALS_UNAVAILABLE };
}

/**
 * Cancel a pending impersonation request (by requester)
 */
export async function cancelImpersonationRequest(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature preserved: callers are unchanged, but no request of this type can exist (#306)
  _requestId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Nothing to cancel: no request of this type can exist.
  return { success: false, error: IMPERSONATION_APPROVALS_UNAVAILABLE };
}

/**
 * Check if user has an approved impersonation request for a specific resident
 */
export async function checkApprovedImpersonation(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature preserved: callers are unchanged, but no request of this type can exist (#306)
  _residentId: string
): Promise<{
  hasApproval: boolean;
  requestId?: string;
  expiresAt?: string;
}> {
  // No approved request of this type can exist, so approval is never granted.
  // This keeps startApprovedImpersonationSession() failing closed.
  return { hasApproval: false };
}

/**
 * Start impersonation session after approval
 * Wrapper that validates approval before starting
 */
export async function startApprovedImpersonationSession(
  residentId: string,
  approvalRequestId: string
): Promise<{
  success: boolean;
  data?: ImpersonationSessionWithDetails;
  error?: string;
}> {
  // Verify approval is valid
  const approval = await checkApprovedImpersonation(residentId);

  if (!approval.hasApproval) {
    return { success: false, error: 'No valid approval found. Please submit a new request.' };
  }

  // Start the session with 'approved' type
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get resident details
  const { data: resident } = await supabase
    .from('residents')
    .select(`
      id,
      first_name,
      last_name,
      resident_code,
      resident_houses!resident_houses_resident_id_fkey (
        house:houses (
          id,
          address,
          short_name
        )
      )
    `)
    .eq('id', residentId)
    .single();

  if (!resident) {
    return { success: false, error: 'Resident not found' };
  }

  // Create session with approval reference
  const { data: session, error: sessionError } = await supabase
    .from('impersonation_sessions')
    .insert({
      admin_profile_id: user.id,
      impersonated_resident_id: residentId,
      session_type: 'approved',
      approval_request_id: approvalRequestId,
    })
    .select()
    .single();

  if (sessionError) {
    return { success: false, error: sessionError.message };
  }

  // Get admin profile
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', user.id)
    .single();

  // Log audit event
  await logAudit({
    action: 'CREATE',
    entityType: 'impersonation_sessions',
    entityId: session.id,
    entityDisplay: `${resident.first_name} ${resident.last_name}`,
    newValues: {
      resident_id: residentId,
      resident_name: `${resident.first_name} ${resident.last_name}`,
      session_type: 'approved',
      approval_request_id: approvalRequestId,
    },
  });

  // Build response
  const residentHouse = (resident.resident_houses as unknown as Array<{ house: { id: string; address: string; short_name: string | null } }>)?.[0]?.house;

  return {
    success: true,
    data: {
      ...session,
      admin: {
        id: adminProfile?.id || user.id,
        full_name: adminProfile?.full_name || 'Unknown',
        email: adminProfile?.email || '',
      },
      resident: {
        id: resident.id,
        first_name: resident.first_name,
        last_name: resident.last_name,
        resident_code: resident.resident_code,
      },
      house: residentHouse ? {
        id: residentHouse.id,
        address: residentHouse.address,
        short_name: residentHouse.short_name,
      } : null,
    },
  };
}

/**
 * Get the current user's pending impersonation request (if any)
 */
export async function getMyPendingImpersonationRequest(): Promise<{
  success: boolean;
  data?: ImpersonationApprovalRequest | null;
  error?: string;
}> {
  // No pending request of this type can exist.
  return { success: true, data: null };
}

/**
 * Toggle impersonation enabled for an admin user (super admin only)
 */
export async function toggleImpersonationEnabled(
  profileId: string,
  enabled: boolean
): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.IMPERSONATION_MANAGE_SETTINGS);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get profile to verify it exists and is an admin
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role_id, impersonation_enabled')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'Profile not found' };
  }

  if (!profile.role_id) {
    return { success: false, error: 'User is not an admin' };
  }

  // Service role: an administrator cannot update another account's profile row
  // under RLS, so this silently affected zero rows. Permission is enforced by
  // the authorization check above.
  const { data: updated, error: updateError } = await createAdminClient()
    .from('profiles')
    .update({ impersonation_enabled: enabled })
    .eq('id', profileId)
    .select('id');

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: 'Failed to update the setting: the account could not be updated' };
  }

  // Log audit event
  await logAudit({
    action: enabled ? 'ACTIVATE' : 'DEACTIVATE',
    entityType: 'profiles',
    entityId: profileId,
    entityDisplay: profile.full_name,
    oldValues: { impersonation_enabled: profile.impersonation_enabled },
    newValues: { impersonation_enabled: enabled },
  });

  return { success: true };
}
