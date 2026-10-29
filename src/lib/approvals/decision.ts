/**
 * The approval decision core, shared by the dashboard actions (`approveRequest`, `rejectRequest`,
 * `reapplyApprovedRequest`) and by approvers with no web session, such as WhatsApp Admin tools (#1297).
 *
 * Deliberately NOT a server-action module (no directive): the dashboard actions call
 * authorizePermission() themselves, first, so their guard stays visible at the action. A caller
 * without a web session goes through `decideAsServiceAccount`, which re-checks the same
 * permissions on the live account instead.
 *
 * Failure strings are part of the contract: the dashboard shows them as they are.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApprovalRequest } from '@/types/database';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { recordAudit } from '@/lib/audit/recorder';
import { createAdminClient } from '@/lib/supabase/server';
import { getApprovalHandler } from '@/lib/approvals/registry';
import { notifyRequesterOfOutcome } from '@/lib/approvals/notify-requester';
import type { ApprovalReviewer } from '@/lib/approvals/reviewer';

export { SESSION_REVIEWER, type ApprovalReviewer } from '@/lib/approvals/reviewer';

export interface ApprovalDecisionResult {
  success: boolean;
  error: string | null;
  warning?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DecisionClient = SupabaseClient<any, any, any>;
type DecisionStatus = 'approved' | 'rejected';

// Fetch the request and check it is still pending.
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

  return { request: request as ApprovalRequest, error: null };
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
  reviewer: ApprovalReviewer,
  action: 'APPROVE' | 'REJECT',
  request: ApprovalRequest,
  status: DecisionStatus,
  reviewerId: string,
  notes?: string
) {
  await reviewer.audit({
    action,
    entityType: 'approval_requests',
    entityId: request.id,
    entityDisplay: `${request.request_type} approval request`,
    oldValues: { status: request.status },
    newValues: { status, reviewed_by: reviewerId, review_notes: notes || null },
  });
}

/** Options only a service caller sets. */
interface DecisionOptions {
  /** Refuse any other request type, as if the request did not exist. */
  requestType?: string;
  /**
   * The reviewer's own resident record: a request that resident filed (over WhatsApp, with no
   * requested_by) is their own request too.
   */
  reviewerResidentId?: string | null;
}

/** Approve a pending request as `reviewerId`, who has already passed approvals.approve_reject. */
export async function approveAsReviewer(
  supabase: DecisionClient,
  requestId: string,
  reviewerId: string,
  reviewer: ApprovalReviewer,
  notes?: string,
  options: DecisionOptions = {}
): Promise<ApprovalDecisionResult> {
  const loaded = await loadPendingRequest(supabase, requestId);
  if (loaded.error !== null) {
    return { success: false, error: loaded.error };
  }
  const request = loaded.request;
  if (options.requestType && request.request_type !== options.requestType) {
    return { success: false, error: 'Request not found' };
  }

  // Maker-checker: the requester cannot approve their own request (#473).
  if (
    request.requested_by === reviewerId ||
    (!!options.reviewerResidentId && request.requested_by_resident_id === options.reviewerResidentId)
  ) {
    return { success: false, error: 'You cannot approve your own request' };
  }

  // Claim the request first, guarded on status = 'pending', so concurrent
  // approvals (or approve vs reject) cannot both apply the changes.
  const { data: claimed, error: updateError } = await supabase
    .from('approval_requests')
    .update(reviewFields('approved', reviewerId, notes))
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
  const applyResult = await applyRequestedChanges(request, supabase, reviewer);
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

  await auditDecision(reviewer, 'APPROVE', request, 'approved', reviewerId, notes);

  const notifyWarning = await notifyRequesterOfOutcome({ request, outcome: 'approved', reviewerId, reviewNotes: notes });

  return { success: true, error: null, warning: applyResult.warning ?? notifyWarning };
}

/**
 * Reject a pending request as `reviewerId`, who has already passed approvals.approve_reject. A
 * requester MAY reject their own request (withdrawing it), so there is deliberately no self-reject check.
 */
export async function rejectAsReviewer(
  supabase: DecisionClient,
  requestId: string,
  reviewerId: string,
  reviewer: ApprovalReviewer,
  notes?: string,
  options: DecisionOptions = {}
): Promise<ApprovalDecisionResult> {
  const loaded = await loadPendingRequest(supabase, requestId);
  if (loaded.error !== null) {
    return { success: false, error: loaded.error };
  }
  const request = loaded.request;
  if (options.requestType && request.request_type !== options.requestType) {
    return { success: false, error: 'Request not found' };
  }

  // Update the request status, guarded on pending so a racing approve is never overwritten
  const { data: updated, error: updateError } = await supabase
    .from('approval_requests')
    .update(reviewFields('rejected', reviewerId, notes))
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

  await auditDecision(reviewer, 'REJECT', request, 'rejected', reviewerId, notes);

  const warning = await notifyRequesterOfOutcome({ request, outcome: 'rejected', reviewerId, reviewNotes: notes });

  return { success: true, error: null, warning };
}

// Apply the requested changes through the request-type registry: unknown/unhandled type fails
// closed, the payload is validated against the handler schema, then the handler applies it.
export async function applyRequestedChanges(
  request: ApprovalRequest,
  supabase: DecisionClient,
  reviewer: ApprovalReviewer
): Promise<ApprovalDecisionResult> {
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

  return handler.apply(request, parsed.data, supabase, reviewer);
}

// ---------------------------------------------------------------------------
// Approvers with no web session (#1297)

/** What a service caller's account may do now: its role's permissions (empty unless active) and its resident record. */
export interface LiveReviewer {
  permissions: string[];
  residentId: string | null;
}

/** The account as it is now, read through the service role. */
export async function loadLiveReviewer(profileId: string): Promise<LiveReviewer> {
  const supabase = createAdminClient();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('approval_status, role_id, resident_id')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return { permissions: [], residentId: null };
  const residentId = profile.resident_id ?? null;
  if (profile.approval_status !== 'active' || !profile.role_id) return { permissions: [], residentId };
  const { data: grants, error: grantError } = await supabase
    .from('role_permissions')
    .select('permission:app_permissions!inner(name, is_active)')
    .eq('role_id', profile.role_id);
  if (grantError) throw grantError;
  const permissions = (grants || []).flatMap((row) => {
    const joined = (Array.isArray(row.permission) ? row.permission[0] : row.permission) as { name?: string; is_active?: boolean } | null;
    return joined?.name && joined.is_active === true ? [joined.name] : [];
  });
  return { permissions, residentId };
}

/**
 * A reviewer with no web session: each check reads the account again, and each audit entry is
 * written with the account as actor and `metadata` added (such as the channel).
 */
export function serviceReviewer(
  profileId: string,
  metadata: Record<string, unknown>,
  loadReviewer: (profileId: string) => Promise<LiveReviewer> = loadLiveReviewer
): ApprovalReviewer {
  return {
    async authorize(permission) {
      const { permissions } = await loadReviewer(profileId);
      return permissions.includes(permission)
        ? { authorized: true, userId: profileId, error: null }
        : { authorized: false, userId: profileId, error: `This needs the ${permission} permission` };
    },
    async audit(entry) {
      await recordAudit({ ...entry, metadata: { ...entry.metadata, ...metadata } }, { userId: profileId });
    },
  };
}

export interface ServiceDecisionInput {
  /** The admin account the caller has already checked; it is checked again here. */
  profileId: string;
  requestId: string;
  decision: 'approve' | 'reject';
  /** Only this request type may be decided. */
  requestType: string;
  /** Permissions the caller's own item needs, on top of approvals.approve_reject. */
  alsoRequires?: string[];
  notes?: string;
  /** Added to every audit entry, such as `{ channel: 'whatsapp_admin' }`. */
  metadata: Record<string, unknown>;
  loadReviewer?: (profileId: string) => Promise<LiveReviewer>;
}

/**
 * Approve or reject as an account with no web session, by the same rules as the dashboard: the live
 * account must hold approvals.approve_reject (and, through the handler, what the request type needs),
 * maker-checker, and the claim guarded on pending.
 */
export async function decideAsServiceAccount(input: ServiceDecisionInput): Promise<ApprovalDecisionResult> {
  const loadReviewer = input.loadReviewer ?? loadLiveReviewer;
  const live = await loadReviewer(input.profileId);
  const missing = [PERMISSIONS.APPROVALS_APPROVE_REJECT, ...(input.alsoRequires ?? [])].find((p) => !live.permissions.includes(p));
  if (missing) return { success: false, error: `This needs the ${missing} permission` };

  const reviewer = serviceReviewer(input.profileId, input.metadata, loadReviewer);
  const supabase = createAdminClient();
  const decide = input.decision === 'approve' ? approveAsReviewer : rejectAsReviewer;
  return decide(supabase, input.requestId, input.profileId, reviewer, input.notes, {
    requestType: input.requestType,
    reviewerResidentId: live.residentId,
  });
}
