import type { ApprovalRequest } from '@/types/database';

/**
 * How long an approved-but-unapplied request must have been waiting before it counts as stuck
 * (#557). Approving claims the row and then applies it in the same request, so anything younger
 * than this may still be mid-apply and must not be applied a second time.
 */
export const STUCK_APPROVAL_MINUTES = 5;

/**
 * True when a request was approved but its change was never applied and the approval is old
 * enough that it cannot still be in flight. Shared by the re-apply action and the approvals page.
 */
export function isStuckApproval(
  request: Pick<ApprovalRequest, 'status' | 'applied_at' | 'reviewed_at'>,
  now: Date = new Date()
): boolean {
  if (request.status !== 'approved') return false;
  if (request.applied_at) return false;
  if (!request.reviewed_at) return false;
  const reviewedAt = Date.parse(request.reviewed_at);
  if (Number.isNaN(reviewedAt)) return false;
  return now.getTime() - reviewedAt > STUCK_APPROVAL_MINUTES * 60 * 1000;
}
