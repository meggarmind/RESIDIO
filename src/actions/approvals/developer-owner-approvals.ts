'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { sendImmediate } from '@/lib/notifications/send';
import { getEffectiveSettingValue } from '@/actions/settings/hierarchical-settings';
import type { ApprovalRequestType, ApprovalEntityType } from '@/types/database';

/**
 * Developer/Owner Approval Types
 */
export type DeveloperOwnerActionType =
  | 'property_access'
  | 'resident_removal'
  | 'resident_modification'
  | 'security_code_change';

export type ApprovalContext = {
  houseId: string;
  requesterResidentId: string;
  actionType: DeveloperOwnerActionType;
  targetResidentId?: string;
  description: string;
  requestedChanges: Record<string, unknown>;
  currentValues?: Record<string, unknown>;
};

type CheckApprovalResponse = {
  requiresApproval: boolean;
  occupier?: {
    residentId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    role: string;
  };
  error: string | null;
};

type CreateApprovalResponse = {
  success: boolean;
  requestId?: string;
  error: string | null;
};

type ProcessExpiredResponse = {
  success: boolean;
  processedCount: number;
  error: string | null;
};

/**
 * Check if an action requires approval from the occupier
 *
 * Approval is required when:
 * - Requester is a developer or non_resident_landlord
 * - There's an active resident_landlord or tenant at the property
 */
export async function checkRequiresApproval(
  houseId: string,
  requesterResidentId: string
): Promise<CheckApprovalResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { requiresApproval: false, error: 'Unauthorized' };
  }

  // Check if approval is required using database function
  const { data: requiresApproval, error: checkError } = await supabase.rpc(
    'requires_approval_for_action',
    {
      p_house_id: houseId,
      p_requester_resident_id: requesterResidentId,
      p_action_type: 'general',
    }
  );

  if (checkError) {
    console.error('[checkRequiresApproval] Error:', checkError);
    return { requiresApproval: false, error: 'Failed to check approval requirements' };
  }

  if (!requiresApproval) {
    return { requiresApproval: false, error: null };
  }

  // Get the primary occupier details
  const { data: occupier, error: occupierError } = await supabase.rpc(
    'get_primary_occupier',
    { p_house_id: houseId }
  );

  if (occupierError) {
    console.error('[checkRequiresApproval] Error getting occupier:', occupierError);
    return { requiresApproval: true, error: 'Failed to get occupier details' };
  }

  if (!occupier || occupier.length === 0) {
    return { requiresApproval: false, error: null };
  }

  const occ = occupier[0];
  return {
    requiresApproval: true,
    occupier: {
      residentId: occ.resident_id,
      firstName: occ.first_name,
      lastName: occ.last_name,
      email: occ.email,
      phone: occ.phone_primary,
      role: occ.resident_role,
    },
    error: null,
  };
}

/**
 * Create an approval request for a developer/owner action
 *
 * Sends notification to the occupier and sets 72-hour auto-reject timer
 */
export async function createDeveloperOwnerApproval(
  context: ApprovalContext
): Promise<CreateApprovalResponse> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Verify approval is required
  const { requiresApproval, occupier, error: checkError } = await checkRequiresApproval(
    context.houseId,
    context.requesterResidentId
  );

  if (checkError) {
    return { success: false, error: checkError };
  }

  if (!requiresApproval || !occupier) {
    return { success: false, error: 'Approval not required for this action' };
  }

  // Get requester details
  const { data: requester } = await supabase
    .from('residents')
    .select('first_name, last_name, resident_houses!inner(resident_role)')
    .eq('id', context.requesterResidentId)
    .eq('resident_houses.house_id', context.houseId)
    .eq('resident_houses.is_active', true)
    .single();

  // Get house details
  const { data: house } = await supabase
    .from('houses')
    .select('house_number, streets(name)')
    .eq('id', context.houseId)
    .single();

  // Map action type to request type
  const requestTypeMap: Record<DeveloperOwnerActionType, ApprovalRequestType> = {
    property_access: requester?.resident_houses?.[0]?.resident_role === 'developer'
      ? 'developer_property_access'
      : 'owner_property_access',
    resident_removal: 'developer_resident_removal',
    resident_modification: 'owner_resident_modification',
    security_code_change: 'owner_security_code_change',
  };

  const requestType = requestTypeMap[context.actionType];

  // Determine entity type and ID
  let entityType: ApprovalEntityType = 'house';
  let entityId = context.houseId;

  if (context.actionType === 'security_code_change') {
    entityType = 'security_code';
    entityId = context.targetResidentId || context.houseId;
  } else if (context.targetResidentId) {
    entityType = 'resident_houses';
  }

  // Get auto-reject timeout from hierarchical settings
  const autoRejectHours = await getEffectiveSettingValue<number>(
    'approval_auto_reject_hours',
    context.houseId
  ) || 72;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + autoRejectHours);

  // Check for existing pending request
  const { data: existing } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('request_type', requestType)
    .eq('status', 'pending')
    .single();

  if (existing) {
    return {
      success: false,
      error: 'A pending approval request already exists for this action',
    };
  }

  // Create the approval request
  const { data: request, error: insertError } = await adminClient
    .from('approval_requests')
    .insert({
      request_type: requestType,
      entity_type: entityType,
      entity_id: entityId,
      requested_changes: context.requestedChanges,
      current_values: context.currentValues || {},
      reason: context.description,
      requested_by: user.id,
      expires_at: expiresAt.toISOString(),
      affected_resident_id: occupier.residentId,
      affected_house_id: context.houseId,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[createDeveloperOwnerApproval] Insert error:', insertError);
    return { success: false, error: 'Failed to create approval request' };
  }

  // Send notification to occupier
  if (occupier.email) {
    const houseAddress = house
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? `${house.house_number} ${(house.streets as any)?.name || ''}`
      : 'your property';

    const requesterName = requester
      ? `${requester.first_name} ${requester.last_name}`
      : 'The property owner/developer';

    const requesterRole = requester?.resident_houses?.[0]?.resident_role || 'owner';

    try {
      await sendImmediate({
        recipientId: occupier.residentId,
        recipientEmail: occupier.email,
        channel: 'email',
        subject: `Action Required: ${getActionLabel(context.actionType)} Request for ${houseAddress}`,
        body: `
Dear ${occupier.firstName},

${requesterName} (${formatRole(requesterRole)}) has requested the following action for ${houseAddress}:

Action: ${getActionLabel(context.actionType)}
Details: ${context.description}

Please review and respond to this request within ${autoRejectHours} hours.

If you do not respond, this request will be automatically rejected.

To approve or reject this request, please log in to the Residio portal.

Thank you,
Residio Estate Management
        `.trim(),
        metadata: {
          approval_request_id: request.id,
          action_type: context.actionType,
          house_id: context.houseId,
        },
      });

      // Update notification sent timestamp
      await adminClient
        .from('approval_requests')
        .update({ notification_sent_at: new Date().toISOString() })
        .eq('id', request.id);
    } catch (notifyError) {
      console.error('[createDeveloperOwnerApproval] Notification error:', notifyError);
      // Don't fail the request if notification fails
    }
  }

  revalidatePath('/approvals');
  return { success: true, requestId: request.id, error: null };
}

/**
 * Approve an approval request as the affected resident
 */
export async function approveAsOccupier(
  requestId: string,
  notes?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Get the request
  const { data: request, error: fetchError } = await supabase
    .from('approval_requests')
    .select('*, affected_resident_id')
    .eq('id', requestId)
    .single();

  if (fetchError || !request) {
    return { success: false, error: 'Request not found' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Request has already been processed' };
  }

  // Verify user is the affected resident or admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, resident_id')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin' || profile?.role === 'chairman';
  const isAffectedResident = profile?.resident_id === request.affected_resident_id;

  if (!isAdmin && !isAffectedResident) {
    return { success: false, error: 'Only the affected resident can approve this request' };
  }

  // Update the request
  const { error: updateError } = await supabase
    .from('approval_requests')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('[approveAsOccupier] Update error:', updateError);
    return { success: false, error: 'Failed to approve request' };
  }

  // TODO: Apply the approved changes (would need to know the action type)
  // This would typically be handled by the calling code after approval

  revalidatePath('/approvals');
  revalidatePath('/portal');
  return { success: true, error: null };
}

/**
 * Reject an approval request as the affected resident
 */
export async function rejectAsOccupier(
  requestId: string,
  notes?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Get the request
  const { data: request, error: fetchError } = await supabase
    .from('approval_requests')
    .select('*, affected_resident_id')
    .eq('id', requestId)
    .single();

  if (fetchError || !request) {
    return { success: false, error: 'Request not found' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Request has already been processed' };
  }

  // Verify user is the affected resident or admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, resident_id')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin' || profile?.role === 'chairman';
  const isAffectedResident = profile?.resident_id === request.affected_resident_id;

  if (!isAdmin && !isAffectedResident) {
    return { success: false, error: 'Only the affected resident can reject this request' };
  }

  // Update the request
  const { error: updateError } = await supabase
    .from('approval_requests')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || 'Rejected by occupier',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('[rejectAsOccupier] Update error:', updateError);
    return { success: false, error: 'Failed to reject request' };
  }

  revalidatePath('/approvals');
  revalidatePath('/portal');
  return { success: true, error: null };
}

/**
 * Process expired approval requests (auto-reject after 72 hours)
 *
 * This should be called by a cron job
 */
export async function processExpiredApprovals(): Promise<ProcessExpiredResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, processedCount: 0, error: 'Unauthorized' };
  }

  // Check user role - only admin can process expired approvals
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { success: false, processedCount: 0, error: 'Only admin can process expired approvals' };
  }

  // Use database function to process expired approvals
  const { data: count, error } = await supabase.rpc('process_expired_approvals');

  if (error) {
    console.error('[processExpiredApprovals] Error:', error);
    return { success: false, processedCount: 0, error: 'Failed to process expired approvals' };
  }

  revalidatePath('/approvals');
  return { success: true, processedCount: count || 0, error: null };
}

/**
 * Get pending approval requests for a resident (as the affected party)
 */
export async function getMyPendingApprovals(): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    request_type: string;
    description: string;
    requester_name: string;
    house_address: string;
    expires_at: string;
    created_at: string;
  }>;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Get the user's resident_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('resident_id')
    .eq('id', user.id)
    .single();

  if (!profile?.resident_id) {
    return { success: true, data: [], error: null };
  }

  // Get pending approvals where this resident is the affected party
  const { data: requests, error } = await supabase
    .from('approval_requests')
    .select(`
      id,
      request_type,
      reason,
      expires_at,
      created_at,
      affected_house_id,
      requester:profiles!requested_by(full_name),
      house:houses!affected_house_id(
        house_number,
        streets(name)
      )
    `)
    .eq('affected_resident_id', profile.resident_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getMyPendingApprovals] Error:', error);
    return { success: false, error: 'Failed to fetch pending approvals' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formattedData = (requests || []).map((r: any) => ({
    id: r.id,
    request_type: r.request_type,
    description: r.reason || 'No description provided',
    requester_name: r.requester?.full_name || 'Unknown',
    house_address: r.house
      ? `${r.house.house_number} ${r.house.streets?.name || ''}`
      : 'Unknown',
    expires_at: r.expires_at,
    created_at: r.created_at,
  }));

  return { success: true, data: formattedData, error: null };
}

/**
 * Send reminder for pending approvals nearing expiration
 */
export async function sendApprovalReminders(): Promise<{
  success: boolean;
  sentCount: number;
  error: string | null;
}> {
  const adminClient = createAdminClient();

  // Get reminder threshold from settings (default 24 hours)
  const reminderHours = await getEffectiveSettingValue<number>('approval_reminder_hours') || 24;

  const reminderThreshold = new Date();
  reminderThreshold.setHours(reminderThreshold.getHours() + reminderHours);

  // Find pending approvals that expire within the reminder threshold
  // and haven't had a reminder sent yet
  const { data: pendingRequests, error } = await adminClient
    .from('approval_requests')
    .select(`
      id,
      request_type,
      reason,
      expires_at,
      affected_resident_id,
      affected_house_id,
      residents!affected_resident_id(
        first_name,
        email
      ),
      houses!affected_house_id(
        house_number,
        streets(name)
      )
    `)
    .eq('status', 'pending')
    .is('reminder_sent_at', null)
    .not('expires_at', 'is', null)
    .lte('expires_at', reminderThreshold.toISOString())
    .gt('expires_at', new Date().toISOString());

  if (error) {
    console.error('[sendApprovalReminders] Error:', error);
    return { success: false, sentCount: 0, error: 'Failed to fetch pending approvals' };
  }

  let sentCount = 0;

  for (const request of pendingRequests || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resident = (request as any).residents;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const house = (request as any).houses;

    if (!resident?.email) continue;

    const houseAddress = house
      ? `${house.house_number} ${house.streets?.name || ''}`
      : 'your property';

    const expiresAt = new Date(request.expires_at!);
    const hoursRemaining = Math.round(
      (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)
    );

    try {
      await sendImmediate({
        recipientId: request.affected_resident_id!,
        recipientEmail: resident.email,
        channel: 'email',
        subject: `Reminder: Approval Request Expires in ${hoursRemaining} Hours`,
        body: `
Dear ${resident.first_name},

This is a reminder that you have a pending approval request for ${houseAddress} that will expire in ${hoursRemaining} hours.

Action: ${getActionLabel(request.request_type as DeveloperOwnerActionType)}
Details: ${request.reason || 'No description provided'}

If you do not respond before ${expiresAt.toLocaleString()}, this request will be automatically rejected.

Please log in to the Residio portal to review and respond to this request.

Thank you,
Residio Estate Management
        `.trim(),
        metadata: {
          approval_request_id: request.id,
          reminder: true,
        },
      });

      // Update reminder sent timestamp
      await adminClient
        .from('approval_requests')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', request.id);

      sentCount++;
    } catch (notifyError) {
      console.error('[sendApprovalReminders] Failed to send reminder:', notifyError);
    }
  }

  return { success: true, sentCount, error: null };
}

// Helper functions
function getActionLabel(actionType: DeveloperOwnerActionType | string): string {
  const labels: Record<string, string> = {
    property_access: 'Property Access',
    resident_removal: 'Resident Removal',
    resident_modification: 'Resident Modification',
    security_code_change: 'Security Code Change',
    developer_property_access: 'Developer Property Access',
    developer_resident_removal: 'Developer Resident Removal',
    owner_property_access: 'Owner Property Access',
    owner_resident_modification: 'Owner Resident Modification',
    owner_security_code_change: 'Owner Security Code Change',
  };
  return labels[actionType] || actionType.replace(/_/g, ' ');
}

function formatRole(role: string): string {
  const labels: Record<string, string> = {
    developer: 'Developer',
    non_resident_landlord: 'Property Owner',
    resident_landlord: 'Owner-Occupier',
    tenant: 'Renter',
  };
  return labels[role] || role.replace(/_/g, ' ');
}
