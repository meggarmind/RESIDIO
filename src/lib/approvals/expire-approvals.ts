import { createAdminClient } from '@/lib/supabase/server';
import { notifyRequesterOfOutcome } from '@/lib/approvals/notify-requester';

export interface ExpireApprovalsResult {
  /** Rows process_expired_approvals() reported rejecting. */
  expired: number;
  /** Requesters we attempted to notify. */
  notified: number;
}

/**
 * Auto-rejects pending approval requests past expires_at via process_expired_approvals() and
 * tells each requester in-app (#558). The function returns only a count, so the due rows are read
 * first and re-read afterwards to learn which were actually rejected. A notification failure
 * never fails the run: notifyRequesterOfOutcome swallows its own errors.
 */
export async function expirePendingApprovals(): Promise<ExpireApprovalsResult> {
  const supabase = createAdminClient();

  const { data: due, error: dueError } = await supabase
    .from('approval_requests')
    .select('id')
    .eq('status', 'pending')
    .not('expires_at', 'is', null)
    .lte('expires_at', new Date().toISOString());
  if (dueError) throw new Error(`Failed to list expiring approvals: ${dueError.message}`);

  const { data: count, error: rpcError } = await supabase.rpc('process_expired_approvals');
  if (rpcError) throw new Error(`process_expired_approvals failed: ${rpcError.message}`);
  const expired = typeof count === 'number' ? count : 0;

  const dueIds = (due ?? []).map((row) => row.id);
  if (expired === 0 || dueIds.length === 0) return { expired, notified: 0 };

  const { data: rejected, error: rejectedError } = await supabase
    .from('approval_requests')
    .select('id, request_type, requested_by')
    .in('id', dueIds)
    .eq('status', 'rejected')
    .like('review_notes', 'Auto-rejected%');
  if (rejectedError) {
    console.error('[expirePendingApprovals] Could not read back expired requests to notify:', rejectedError);
    return { expired, notified: 0 };
  }

  let notified = 0;
  for (const request of rejected ?? []) {
    await notifyRequesterOfOutcome({ request, outcome: 'expired' });
    notified += 1;
  }
  return { expired, notified };
}
