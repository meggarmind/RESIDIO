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
import { startImpersonationSession } from './index';

/**
 * Send an in-app notification to an admin profile
 * Uses admin client to bypass RLS since notifications are for profiles, not residents
 */
async function sendAdminNotification(params: {
  recipientProfileId: string;
  title: string;
  message: string;
  category: string;
  actionUrl?: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('in_app_notifications').insert({
      recipient_id: params.recipientProfileId,
      title: params.title,
      body: params.message,
      category: params.category,
      action_url: params.actionUrl || null,
      priority: 'high',
      is_read: false,
      metadata: { type: 'admin_notification' },
    });
  } catch (error) {
    // Log error but don't fail the main operation
    console.error('Failed to send admin notification:', error);
  }
}

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
 * Create an impersonation approval request
 * Used by non-super admins who need approval to impersonate
 */
export async function createImpersonationApprovalRequest(
  residentId: string,
  reason?: string
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

  // Check for existing pending request for this resident
  const { data: existingRequest } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('requested_by', user.id)
    .eq('request_type', 'impersonation_request')
    .eq('status', 'pending')
    .single();

  if (existingRequest) {
    return { success: false, error: 'You already have a pending impersonation request' };
  }

  // Get resident details
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select(`
      id,
      first_name,
      last_name,
      resident_code,
      resident_houses!resident_houses_resident_id_fkey (
        house:houses (
          address
        )
      )
    `)
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { success: false, error: 'Resident not found' };
  }

  const houseAddress = (resident.resident_houses as unknown as Array<{ house: { address: string } }>)?.[0]?.house?.address || null;

  // Create approval request
  const requestData: ImpersonationApprovalData = {
    resident_id: residentId,
    resident_name: `${resident.first_name} ${resident.last_name}`,
    resident_code: resident.resident_code,
    house_address: houseAddress,
    reason,
  };

  const { data: request, error: requestError } = await supabase
    .from('approval_requests')
    .insert({
      request_type: 'impersonation_request',
      entity_type: 'impersonation_session',
      entity_id: residentId, // Using resident ID as entity
      requested_changes: requestData,
      current_values: {},
      reason: reason || null,
      status: 'pending',
      requested_by: user.id,
    })
    .select()
    .single();

  if (requestError) {
    return { success: false, error: requestError.message };
  }

  // Log audit event
  await logAudit({
    action: 'CREATE',
    entityType: 'approval_requests',
    entityId: request.id,
    entityDisplay: `Impersonation request: ${resident.first_name} ${resident.last_name}`,
    newValues: requestData,
  });

  // Notify approvers
  await notifyImpersonationApprovers(request.id, profile.full_name, requestData);

  return {
    success: true,
    data: {
      ...request,
      requested_changes: requestData,
      requester: {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
      },
    },
  };
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

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get pending requests (excluding own requests)
  const { data: requests, error } = await supabase
    .from('approval_requests')
    .select(`
      *,
      requester:profiles!requested_by (
        id,
        full_name,
        email
      )
    `)
    .eq('request_type', 'impersonation_request')
    .eq('status', 'pending')
    .neq('requested_by', user.id) // Cannot approve own requests
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: (requests || []).map((r) => ({
      ...r,
      requested_changes: r.requested_changes as ImpersonationApprovalData,
      requester: r.requester as { id: string; full_name: string; email: string },
    })),
  };
}

/**
 * Approve an impersonation request
 */
export async function approveImpersonationRequest(
  requestId: string,
  note?: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.IMPERSONATION_APPROVE_REQUESTS);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the request
  const { data: request, error: requestError } = await supabase
    .from('approval_requests')
    .select(`
      *,
      requester:profiles!requested_by (
        id,
        full_name,
        email
      )
    `)
    .eq('id', requestId)
    .eq('request_type', 'impersonation_request')
    .single();

  if (requestError || !request) {
    return { success: false, error: 'Request not found' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Request has already been processed' };
  }

  if (request.requested_by === user.id) {
    return { success: false, error: 'You cannot approve your own request' };
  }

  // Update the request
  const { error: updateError } = await supabase
    .from('approval_requests')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: note || null,
    })
    .eq('id', requestId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Log audit event
  const requestData = request.requested_changes as ImpersonationApprovalData;
  await logAudit({
    action: 'APPROVE',
    entityType: 'approval_requests',
    entityId: requestId,
    entityDisplay: `Impersonation request: ${requestData.resident_name}`,
    oldValues: { status: 'pending' },
    newValues: { status: 'approved', review_notes: note },
  });

  // Notify requester
  const requester = request.requester as { id: string; full_name: string; email: string };
  await sendAdminNotification({
    recipientProfileId: requester.id,
    title: 'Impersonation Request Approved',
    message: `Your request to view the portal as ${requestData.resident_name} has been approved.`,
    category: 'system',
    actionUrl: '/portal',
  });

  return { success: true };
}

/**
 * Deny an impersonation request
 */
export async function denyImpersonationRequest(
  requestId: string,
  reason: string
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

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the request
  const { data: request, error: requestError } = await supabase
    .from('approval_requests')
    .select(`
      *,
      requester:profiles!requested_by (
        id,
        full_name,
        email
      )
    `)
    .eq('id', requestId)
    .eq('request_type', 'impersonation_request')
    .single();

  if (requestError || !request) {
    return { success: false, error: 'Request not found' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Request has already been processed' };
  }

  if (request.requested_by === user.id) {
    return { success: false, error: 'You cannot deny your own request' };
  }

  // Update the request
  const { error: updateError } = await supabase
    .from('approval_requests')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: reason,
    })
    .eq('id', requestId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Log audit event
  const requestData = request.requested_changes as ImpersonationApprovalData;
  await logAudit({
    action: 'REJECT',
    entityType: 'approval_requests',
    entityId: requestId,
    entityDisplay: `Impersonation request: ${requestData.resident_name}`,
    oldValues: { status: 'pending' },
    newValues: { status: 'rejected', review_notes: reason },
  });

  // Notify requester
  const requester = request.requester as { id: string; full_name: string; email: string };
  await sendAdminNotification({
    recipientProfileId: requester.id,
    title: 'Impersonation Request Denied',
    message: `Your request to view the portal as ${requestData.resident_name} has been denied. Reason: ${reason}`,
    category: 'system',
  });

  return { success: true };
}

/**
 * Cancel a pending impersonation request (by requester)
 */
export async function cancelImpersonationRequest(requestId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the request
  const { data: request, error: requestError } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', requestId)
    .eq('request_type', 'impersonation_request')
    .eq('requested_by', user.id) // Must be own request
    .single();

  if (requestError || !request) {
    return { success: false, error: 'Request not found' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Request has already been processed' };
  }

  // Delete the request (or mark as cancelled)
  const { error: deleteError } = await supabase
    .from('approval_requests')
    .delete()
    .eq('id', requestId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  // Log audit event
  const requestData = request.requested_changes as ImpersonationApprovalData;
  await logAudit({
    action: 'DELETE',
    entityType: 'approval_requests',
    entityId: requestId,
    entityDisplay: `Impersonation request: ${requestData.resident_name}`,
    oldValues: { status: 'pending' },
  });

  return { success: true };
}

/**
 * Check if user has an approved impersonation request for a specific resident
 */
export async function checkApprovedImpersonation(residentId: string): Promise<{
  hasApproval: boolean;
  requestId?: string;
  expiresAt?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { hasApproval: false };
  }

  // Check for approved request within last 4 hours (default expiry)
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  const { data: request } = await supabase
    .from('approval_requests')
    .select('id, reviewed_at')
    .eq('requested_by', user.id)
    .eq('request_type', 'impersonation_request')
    .eq('entity_id', residentId)
    .eq('status', 'approved')
    .gte('reviewed_at', fourHoursAgo)
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .single();

  if (!request) {
    return { hasApproval: false };
  }

  // Calculate expiry (4 hours from approval)
  const expiresAt = new Date(new Date(request.reviewed_at).getTime() + 4 * 60 * 60 * 1000).toISOString();

  return {
    hasApproval: true,
    requestId: request.id,
    expiresAt,
  };
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
 * Notify approvers of a new impersonation request
 */
async function notifyImpersonationApprovers(
  requestId: string,
  requesterName: string,
  requestData: ImpersonationApprovalData
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  // Get all profiles with impersonation.approve_requests permission
  // This is done by finding roles with that permission, then finding profiles with those roles
  const { data: roleIds } = await supabase
    .from('role_permissions')
    .select('role_id')
    .eq('permission_id', (
      await supabase
        .from('app_permissions')
        .select('id')
        .eq('name', 'impersonation.approve_requests')
        .single()
    ).data?.id || '');

  if (!roleIds || roleIds.length === 0) return;

  const { data: approvers } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('role_id', roleIds.map((r) => r.role_id));

  if (!approvers || approvers.length === 0) return;

  // Send notification to each approver
  for (const approver of approvers) {
    await sendAdminNotification({
      recipientProfileId: approver.id,
      title: 'Impersonation Request',
      message: `${requesterName} is requesting to view the portal as ${requestData.resident_name}`,
      category: 'system',
      actionUrl: `/approvals?type=impersonation`,
    });
  }
}

/**
 * Get the current user's pending impersonation request (if any)
 */
export async function getMyPendingImpersonationRequest(): Promise<{
  success: boolean;
  data?: ImpersonationApprovalRequest | null;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: request, error } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('requested_by', user.id)
    .eq('request_type', 'impersonation_request')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: request ? {
      ...request,
      requested_changes: request.requested_changes as ImpersonationApprovalData,
    } : null,
  };
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

  // Update the setting
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ impersonation_enabled: enabled })
    .eq('id', profileId);

  if (updateError) {
    return { success: false, error: updateError.message };
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
