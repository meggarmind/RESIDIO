'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { embed } from '@/lib/utils';
import type {
  ApprovalRequest,
  ApprovalRequestWithDetails,
  ApprovalStatus,
  ApprovalRequestType,
} from '@/types/database';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { getApprovalHandler } from '@/lib/approvals/registry';
import { isStuckApproval } from '@/lib/approvals/stuck';
import { notifyRequesterOfOutcome } from '@/lib/approvals/notify-requester';

// Response types
interface GetApprovalRequestsResponse {
  data: ApprovalRequestWithDetails[] | null;
  count: number;
  error: string | null;
}

interface ApprovalActionResponse {
  success: boolean;
  error: string | null;
  warning?: string;
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

  // Permission check (migrated off the legacy role-list check)
  const auth = await authorizePermission(PERMISSIONS.APPROVALS_VIEW);
  if (!auth.authorized) {
    return { data: null, count: 0, error: auth.error || 'Unauthorized' };
  }

  // Build query. `approval_requests` has two foreign keys to `profiles`
  // (requested_by, reviewed_by), so both outer embeds keep their explicit hint
  // or PostgREST answers PGRST201. The role itself now comes from the RBAC join
  // rather than the legacy `profiles.role` column #193 renamed out of
  // existence; `profiles` -> `app_roles` is hinted the same way middleware.ts
  // hints it.
  let query = supabase.from('approval_requests').select(
    `
      *,
      requester:profiles!requested_by(id, full_name, email, app_roles!profiles_role_id_fkey(name)),
      reviewer:profiles!reviewed_by(id, full_name, email, app_roles!profiles_role_id_fkey(name))
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
          .select('amount, resident:residents!payment_records_resident_id_fkey(first_name, last_name)')
          .eq('id', request.entity_id)
          .single();

        if (payment) {
          const res = embed(payment.resident);
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

  // Anyone without approvals.view sees no badge at all: this is a soft "nothing
  // to show" for a sidebar count, not an authorization failure, so we return a
  // clean 0/null here rather than surfacing auth.error, which would otherwise
  // put usePendingApprovalsCount() into an error state for every non-privileged
  // user (it throws on a truthy `error`).
  const auth = await authorizePermission(PERMISSIONS.APPROVALS_VIEW);
  if (!auth.authorized) {
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

type DecisionStatus = 'approved' | 'rejected';
type DecisionClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// Shared decision core (approve and reject). Each action still calls authorizePermission()
// itself, first, so its guard stays visible at the action; everything after that is shared.

// Fetch the request and check it is still pending. Failure strings are part of the contract.
async function loadPendingRequest(
  supabase: DecisionClient,
  requestId: string
): Promise<{ request: ApprovalRequest; error: null } | { request: null; error: string }> {
  const { data: request, error: fetchError } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError || !request) {
    return { request: null, error: 'Request not found' };
  }

  if (request.status !== 'pending') {
    return { request: null, error: 'Request has already been processed' };
  }

  return { request, error: null };
}

// The review fields every decision writes onto the request row.
function reviewFields(status: DecisionStatus, reviewerId: string, notes?: string) {
  return {
    status,
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    review_notes: notes || null,
    updated_at: new Date().toISOString(),
  };
}

// Audit the decision on the approval request itself.
async function auditDecision(
  action: 'APPROVE' | 'REJECT',
  request: ApprovalRequest,
  status: DecisionStatus,
  reviewerId: string,
  notes?: string
) {
  await logAudit({
    action,
    entityType: 'approval_requests',
    entityId: request.id,
    entityDisplay: `${request.request_type} approval request`,
    oldValues: { status: request.status },
    newValues: { status, reviewed_by: reviewerId, review_notes: notes || null },
  });
}

// Approve a request
export async function approveRequest(
  requestId: string,
  notes?: string
): Promise<ApprovalActionResponse> {
  const supabase = await createServerSupabaseClient();

  // Permission check (migrated off the legacy role-list check)
  const auth = await authorizePermission(PERMISSIONS.APPROVALS_APPROVE_REJECT);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const loaded = await loadPendingRequest(supabase, requestId);
  if (loaded.error !== null) {
    return { success: false, error: loaded.error };
  }
  const request = loaded.request;

  // Maker-checker: the requester cannot approve their own request (#473).
  if (request.requested_by === auth.userId) {
    return { success: false, error: 'You cannot approve your own request' };
  }

  // Claim the request first, guarded on status = 'pending', so concurrent
  // approvals (or approve vs reject) cannot both apply the changes.
  const { data: claimed, error: updateError } = await supabase
    .from('approval_requests')
    .update(reviewFields('approved', auth.userId!, notes))
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  if (!claimed) {
    return { success: false, error: 'Request has already been processed' };
  }

  // Apply the changes based on request type
  const applyResult = await applyRequestedChanges(request);
  if (!applyResult.success) {
    // Release the claim so the request can be retried.
    const { error: releaseError } = await supabase
      .from('approval_requests')
      .update({
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'approved');
    if (releaseError) {
      console.error('Approval claim release error (request may be stuck approved):', releaseError);
      return {
        success: false,
        error: `${applyResult.error} The request could not be reset and may be stuck as approved without its changes applied. Contact an administrator.`,
      };
    }
    return applyResult;
  }

  // Record that the change landed. A failure here must not fail the approval: the change is
  // applied, and a row left without applied_at looks stuck, which reapplyApprovedRequest
  // resolves idempotently.
  const appliedAt = new Date().toISOString();
  const { error: appliedError } = await supabase
    .from('approval_requests')
    .update({ applied_at: appliedAt, updated_at: appliedAt })
    .eq('id', requestId)
    .eq('status', 'approved');
  if (appliedError) {
    console.error(
      `Failed to record applied_at for approval request ${requestId} (change was applied; it may show as stuck):`,
      appliedError
    );
  }

  await auditDecision('APPROVE', request, 'approved', auth.userId!, notes);

  const notifyWarning = await notifyRequesterOfOutcome({ request, outcome: 'approved', reviewerId: auth.userId, reviewNotes: notes });

  return { success: true, error: null, warning: applyResult.warning ?? notifyWarning };
}

// Re-apply an approved request whose change was never applied (#557): the process died between
// the claim and the apply, or the release after a failed apply also failed. The apply is
// idempotent because it writes the requested value. The maker-checker rule is not re-checked:
// the approval already happened.
export async function reapplyApprovedRequest(requestId: string): Promise<ApprovalActionResponse> {
  const supabase = await createServerSupabaseClient();

  const auth = await authorizePermission(PERMISSIONS.APPROVALS_APPROVE_REJECT);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const { data: request, error: fetchError } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError || !request) {
    return { success: false, error: 'Request not found' };
  }

  if (request.status !== 'approved') {
    return { success: false, error: 'Only an approved request can be re-applied' };
  }

  if (request.applied_at) {
    return { success: false, error: 'This request has already been applied' };
  }

  // A request approved moments ago may still be mid-apply; applying it again could double up.
  if (!isStuckApproval(request)) {
    return {
      success: false,
      error: 'This approval is still being applied; try again in a few minutes',
    };
  }

  const applyResult = await applyRequestedChanges(request);
  if (!applyResult.success) {
    return applyResult;
  }

  // Guarded on applied_at being null so two concurrent re-applies cannot both succeed.
  const appliedAt = new Date().toISOString();
  const { data: marked, error: markError } = await supabase
    .from('approval_requests')
    .update({ applied_at: appliedAt, updated_at: appliedAt })
    .eq('id', requestId)
    .eq('status', 'approved')
    .is('applied_at', null)
    .select('id')
    .maybeSingle();

  if (markError) {
    return { success: false, error: markError.message };
  }

  if (!marked) {
    return { success: false, error: 'This request has already been applied' };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'approval_requests',
    entityId: requestId,
    entityDisplay: `${request.request_type} approval request`,
    description: 'Re-applied an approved request that had not been applied',
    oldValues: { applied_at: null },
    newValues: { applied_at: appliedAt },
  });

  const notifyWarning = await notifyRequesterOfOutcome({
    request,
    outcome: 'approved',
    reviewerId: auth.userId,
    reviewNotes: request.review_notes,
  });

  return { success: true, error: null, warning: applyResult.warning ?? notifyWarning };
}

// Reject a request. A requester MAY reject their own request (withdrawing it), so there is
// deliberately no self-reject check here.
export async function rejectRequest(
  requestId: string,
  notes?: string
): Promise<ApprovalActionResponse> {
  const supabase = await createServerSupabaseClient();

  // Permission check (migrated off the legacy role-list check)
  const auth = await authorizePermission(PERMISSIONS.APPROVALS_APPROVE_REJECT);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const loaded = await loadPendingRequest(supabase, requestId);
  if (loaded.error !== null) {
    return { success: false, error: loaded.error };
  }
  const request = loaded.request;

  // Update the request status, guarded on pending so a racing approve is never overwritten
  const { data: updated, error: updateError } = await supabase
    .from('approval_requests')
    .update(reviewFields('rejected', auth.userId!, notes))
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // No row back: another approver claimed or rejected it between our read and this write
  if (!updated) {
    return { success: false, error: 'Request has already been processed' };
  }

  await auditDecision('REJECT', request, 'rejected', auth.userId!, notes);

  const warning = await notifyRequesterOfOutcome({ request, outcome: 'rejected', reviewerId: auth.userId, reviewNotes: notes });

  return { success: true, error: null, warning };
}

// Apply the requested changes through the request-type registry: unknown/unhandled type fails
// closed, the payload is validated against the handler schema, then the handler applies it.
async function applyRequestedChanges(request: ApprovalRequest): Promise<ApprovalActionResponse> {
  const handler = getApprovalHandler(request.request_type);
  if (!handler) {
    return {
      success: false,
      error: `Unhandled approval request type: ${request.request_type}`,
    };
  }

  const parsed = handler.schema.safeParse(request.requested_changes);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid requested changes for ${request.request_type}: ${parsed.error.issues
        .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
        .join('; ')}`,
    };
  }

  const supabase = await createServerSupabaseClient();
  return handler.apply(request, parsed.data, supabase);
}

// Check if user can auto-approve (holds approvals.approve_reject)
export async function canAutoApprove(): Promise<boolean> {
  const auth = await authorizePermission(PERMISSIONS.APPROVALS_APPROVE_REJECT);
  return auth.authorized;
}
