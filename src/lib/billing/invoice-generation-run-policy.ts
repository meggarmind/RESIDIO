export type InvoiceGenerationRunStatus = 'awaiting_approval' | 'queued' | 'processing' | 'completed' | 'completed_with_errors' | 'cancelled';

export interface InvoiceGenerationApprovalPolicyInput {
  mode?: 'selected_month' | 'backfill';
  dualApprovalEnabled?: boolean;
  totalAmount?: number;
  threshold?: number;
}

export function requiresDistinctInvoiceGenerationApproval({
  mode,
  dualApprovalEnabled = false,
  totalAmount = 0,
  threshold = Number.POSITIVE_INFINITY,
}: InvoiceGenerationApprovalPolicyInput): boolean {
  return mode === 'backfill' && dualApprovalEnabled && totalAmount >= threshold;
}

export function determineInvoiceGenerationRunStatus(input: InvoiceGenerationApprovalPolicyInput & {
  pending?: number;
  processing?: number;
  failed?: number;
  created?: number;
  skipped?: number;
  cancelled?: number;
}): InvoiceGenerationRunStatus {
  if (requiresDistinctInvoiceGenerationApproval(input)) return 'awaiting_approval';
  if (input.pending === undefined && input.processing === undefined && input.failed === undefined && input.created === undefined && input.skipped === undefined && input.cancelled === undefined) return 'queued';
  if ((input.pending || 0) > 0 || (input.processing || 0) > 0) return 'processing';
  if ((input.failed || 0) > 0) return 'completed_with_errors';
  if ((input.cancelled || 0) > 0 && !(input.created || 0) && !(input.skipped || 0)) return 'cancelled';
  return 'completed';
}
