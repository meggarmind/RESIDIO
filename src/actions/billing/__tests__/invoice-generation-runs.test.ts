import { describe, expect, it } from 'vitest';
import {
  determineInvoiceGenerationRunStatus,
  requiresDistinctInvoiceGenerationApproval,
} from '@/lib/billing/invoice-generation-run-policy';

describe('invoice generation run policy', () => {
  it('queues a routine monthly run with single approval by default', () => {
    expect(determineInvoiceGenerationRunStatus({ mode: 'selected_month', dualApprovalEnabled: false, totalAmount: 20_000 }))
      .toBe('queued');
  });

  it('requires a distinct approver only for configured threshold backfills', () => {
    expect(requiresDistinctInvoiceGenerationApproval({ mode: 'backfill', dualApprovalEnabled: true, totalAmount: 100_000, threshold: 100_000 }))
      .toBe(true);
    expect(requiresDistinctInvoiceGenerationApproval({ mode: 'backfill', dualApprovalEnabled: true, totalAmount: 99_999, threshold: 100_000 }))
      .toBe(false);
  });

  it('does not mark a run complete while candidates remain pending or processing', () => {
    expect(determineInvoiceGenerationRunStatus({ pending: 1, processing: 0, failed: 0, created: 0, skipped: 0, cancelled: 0 }))
      .toBe('processing');
    expect(determineInvoiceGenerationRunStatus({ pending: 0, processing: 0, failed: 1, created: 0, skipped: 0, cancelled: 0 }))
      .toBe('completed_with_errors');
  });
});
