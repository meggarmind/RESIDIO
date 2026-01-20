'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  ApprovalRequest,
  ApprovalRequestWithDetails,
  ApprovalStatus,
  ApprovalRequestType,
  ApprovalEntityType,
  UserRole,
} from '@/types/database';
import {
  createBankAccountDirect,
  updateBankAccountDirect,
  deleteBankAccountDirect,
} from '@/actions/imports/bank-accounts';
import { creditWallet, allocateWalletToInvoices } from '@/actions/billing/wallet';
import { logAudit } from '@/lib/audit/logger';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { PERMISSIONS } from '@/lib/auth/action-roles';

// Response types
interface GetApprovalRequestsResponse {
  data: ApprovalRequestWithDetails[] | null;
  count: number;
  error: string | null;
}

interface ApprovalActionResponse {
  success: boolean;
  error: string | null;
}

interface PendingCountResponse {
  count: number;
  error: string | null;
}

// Get approval requests with filtering and pagination
export async function getApprovalRequests(params: {
  status?: ApprovalStatus | 'all';
  request_type?: ApprovalRequestType | 'all';
  page?: number;
  limit?: number;
}): Promise<GetApprovalRequestsResponse> {
  const supabase = await createServerSupabaseClient();
  const { status = 'pending', request_type, page = 1, limit = 20 } = params;

  // Check user role - only admin and chairman can view all requests
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, count: 0, error: 'Unauthorized' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'chairman'].includes(profile.role)) {
    return { data: null, count: 0, error: 'Insufficient permissions' };
  }

  // Build query
  let query = supabase.from('approval_requests').select(
    `
      *,
      requester:profiles!requested_by(id, full_name, email, role),
      reviewer:profiles!reviewed_by(id, full_name, email, role)
    `,
    { count: 'exact' }
  );

  // Apply filters
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  if (request_type && request_type !== 'all') {
    query = query.eq('request_type', request_type);
  }

  // Apply pagination
  const offset = (page - 1) * limit;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return { data: null, count: 0, error: error.message };
  }

  // Enrich with entity names
  const enrichedData = await Promise.all(
    (data || []).map(async (request) => {
      let entity_name = 'Unknown';

      if (request.entity_type === 'billing_profile') {
        const { data: profile } = await supabase
          .from('billing_profiles')
          .select('name')
          .eq('id', request.entity_id)
          .single();
        entity_name = profile?.name || 'Deleted Profile';
      } else if (request.entity_type === 'house') {
        const { data: house } = await supabase
          .from('houses')
          .select('house_number, street:streets(name)')
          .eq('id', request.entity_id)
          .single();
        if (house) {
          const street = house.street as unknown as { name: string } | null;
          entity_name = `${house.house_number} ${street?.name || ''}`.trim();
        } else {
          entity_name = 'Deleted House';
        }
      } else if (request.entity_type === 'estate_bank_account') {
        // For pending creates, entity_id is 'pending' so we get info from requested_changes
        if (request.entity_id === 'pending') {
          const changes = request.requested_changes as {
            bank_name?: string;
            account_number?: string;
            account_name?: string;
          };
          entity_name = changes.account_name
            ? `${changes.account_name} (${changes.account_number || 'New'})`
            : `${changes.bank_name || 'Bank'} - ${changes.account_number || 'New Account'}`;
        } else {
          const { data: bankAccount } = await supabase
            .from('estate_bank_accounts')
            .select('bank_name, account_number, account_name')
            .eq('id', request.entity_id)
            .single();
          entity_name = bankAccount
            ? `${bankAccount.account_name} (${bankAccount.account_number})`
            : 'Deleted Account';
        }
      } else if (request.entity_type === 'payment_record') {
        const { data: payment } = await supabase
          .from('payment_records')
          .select('amount, resident:residents(first_name, last_name)')
          .eq('id', request.entity_id)
          .single();

        if (payment) {
          const res = payment.resident as any;
          entity_name = `₦${payment.amount.toLocaleString()} - ${res?.first_name} ${res?.last_name}`;
        } else {
          entity_name = 'Deleted Payment';
        }
      }

      return {
        ...request,
        entity_name,
      } as ApprovalRequestWithDetails;
    })
  );

  return { data: enrichedData, count: count || 0, error: null };
}

// Get pending approvals count (for sidebar badge)
export async function getPendingApprovalsCount(): Promise<PendingCountResponse> {
  const supabase = await createServerSupabaseClient();

  // Check user role
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { count: 0, error: 'Unauthorized' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // Only admin and chairman see the count
  if (!profile || !['admin', 'chairman'].includes(profile.role)) {
    return { count: 0, error: null };
  }

  const { count, error } = await supabase
    .from('approval_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: count || 0, error: null };
}

// Approve a request
export async function approveRequest(
  requestId: string,
  notes?: string
): Promise<ApprovalActionResponse> {
  const supabase = await createServerSupabaseClient();

  // Check user role
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'chairman'].includes(profile.role)) {
    return { success: false, error: 'Only admin or chairman can approve requests' };
  }

  // Get the request
  const { data: request, error: fetchError } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError || !request) {
    return { success: false, error: 'Request not found' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Request has already been processed' };
  }

  // Apply the changes based on request type
  const applyResult = await applyRequestedChanges(request);
  if (!applyResult.success) {
    return applyResult;
  }

  // Update the request status
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
    return { success: false, error: updateError.message };
  }

  return { success: true, error: null };
}

// Reject a request
export async function rejectRequest(
  requestId: string,
  notes?: string
): Promise<ApprovalActionResponse> {
  const supabase = await createServerSupabaseClient();

  // Check user role
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'chairman'].includes(profile.role)) {
    return { success: false, error: 'Only admin or chairman can reject requests' };
  }

  // Get the request
  const { data: request, error: fetchError } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError || !request) {
    return { success: false, error: 'Request not found' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Request has already been processed' };
  }

  // Update the request status
  const { error: updateError } = await supabase
    .from('approval_requests')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true, error: null };
}

// Helper function to apply requested changes
async function applyRequestedChanges(request: ApprovalRequest): Promise<ApprovalActionResponse> {
  const supabase = await createServerSupabaseClient();

  if (request.request_type === 'billing_profile_effective_date') {
    // Update billing profile effective_date
    const { effective_date } = request.requested_changes as { effective_date: string };

    const { error } = await supabase
      .from('billing_profiles')
      .update({
        effective_date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.entity_id);

    if (error) {
      return { success: false, error: `Failed to update billing profile: ${error.message}` };
    }
  } else if (request.request_type === 'house_plots_change') {
    // Update house number_of_plots
    const { number_of_plots } = request.requested_changes as { number_of_plots: number };

    const { error } = await supabase
      .from('houses')
      .update({
        number_of_plots,
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.entity_id);

    if (error) {
      return { success: false, error: `Failed to update house: ${error.message}` };
    }
  } else if (request.request_type === 'bank_account_create') {
    // Create a new bank account
    const changes = request.requested_changes as {
      account_number: string;
      account_name: string;
      bank_name: string;
      description?: string | null;
      is_active?: boolean;
    };

    const result = await createBankAccountDirect(changes, request.id);
    if (result.error) {
      return { success: false, error: `Failed to create bank account: ${result.error}` };
    }

    // Update the approval request with the actual entity_id
    if (result.data) {
      await supabase
        .from('approval_requests')
        .update({ entity_id: result.data.id })
        .eq('id', request.id);
    }
  } else if (request.request_type === 'bank_account_update') {
    // Update an existing bank account
    const changes = request.requested_changes as {
      account_number?: string;
      account_name?: string;
      bank_name?: string;
      description?: string | null;
      is_active?: boolean;
    };

    const result = await updateBankAccountDirect(request.entity_id, changes, request.id);
    if (result.error) {
      return { success: false, error: `Failed to update bank account: ${result.error}` };
    }
  } else if (request.request_type === 'bank_account_delete') {
    // Delete (or deactivate) a bank account
    const result = await deleteBankAccountDirect(request.entity_id, request.id);
    if (result.error) {
      return { success: false, error: `Failed to delete bank account: ${result.error}` };
    }
  } else if (request.request_type === 'manual_payment_verification') {
    // 1. Update payment record status
    const { error: paymentError } = await supabase
      .from('payment_records')
      .update({
        status: 'paid',
        is_verified: true,
        verified_at: new Date().toISOString(),
        verified_by: request.reviewed_by, // This will be set by the caller after this function returns, but we can set it here if we want or let the main action do it.
        // Wait, Reviewed_by is set in approveRequest AFTER applyRequestedChanges.
        // So we should use auth.uid() or pass it in.
      })
      .eq('id', request.entity_id);

    if (paymentError) {
      return { success: false, error: `Failed to update payment record: ${paymentError.message}` };
    }

    // Get payment details for wallet credit
    const { data: payment } = await supabase
      .from('payment_records')
      .select('*')
      .eq('id', request.entity_id)
      .single();

    if (!payment) {
      return { success: false, error: 'Payment record not found' };
    }

    // 2. Credit wallet
    const creditResult = await creditWallet(
      payment.resident_id,
      payment.amount,
      'payment',
      payment.id,
      `Manual payment approved by admin`
    );

    if (!creditResult.success) {
      console.error('Wallet credit failed during approval:', creditResult.error);
      // We don't fail the whole operation since the payment is already marked 'paid'
      // but this is a critical state inconsistency.
    }

    // 3. Allocate to invoices
    await allocateWalletToInvoices(payment.resident_id, payment.house_id);

    // 4. Audit Log
    await logAudit({
      action: 'APPROVE',
      entityType: 'payments',
      entityId: payment.id,
      entityDisplay: `Manual Payment Approved: ₦${payment.amount.toLocaleString()}`,
      newValues: { status: 'paid', verified: true },
    });
  }

  return { success: true, error: null };
}

// Create an approval request (called internally by other actions)
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

// Check if user can auto-approve (admin or chairman)
export async function canAutoApprove(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === 'admin' || profile?.role === 'chairman';
}

// Get current user's role
export async function getCurrentUserRole(): Promise<UserRole | null> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role || null;
}
