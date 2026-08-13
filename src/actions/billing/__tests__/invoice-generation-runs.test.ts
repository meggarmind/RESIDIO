import { describe, expect, it } from 'vitest';
import {
  determineInvoiceGenerationRunStatus,
  canCancelInvoiceGenerationRun,
  canRetryInvoiceGenerationRun,
  canReclaimInvoiceGenerationCandidate,
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

  it('only permits cancellation for queued or processing work', () => {
    expect(canCancelInvoiceGenerationRun('queued')).toBe(true);
    expect(canCancelInvoiceGenerationRun('processing')).toBe(true);
    expect(canCancelInvoiceGenerationRun('awaiting_approval')).toBe(false);
    expect(canCancelInvoiceGenerationRun('completed_with_errors')).toBe(false);
    expect(canCancelInvoiceGenerationRun('completed')).toBe(false);
  });

  it('retries only completed error runs that have failed candidates', () => {
    expect(canRetryInvoiceGenerationRun('completed_with_errors', 1)).toBe(true);
    expect(canRetryInvoiceGenerationRun('awaiting_approval', 1)).toBe(false);
    expect(canRetryInvoiceGenerationRun('completed_with_errors', 0)).toBe(false);
  });

  it('reclaims only expired processing claims', () => {
    expect(canReclaimInvoiceGenerationCandidate('processing', new Date('2026-08-13T00:00:00Z'), new Date('2026-08-13T00:16:00Z'), 15)).toBe(true);
    expect(canReclaimInvoiceGenerationCandidate('processing', new Date('2026-08-13T00:00:00Z'), new Date('2026-08-13T00:14:00Z'), 15)).toBe(false);
    expect(canReclaimInvoiceGenerationCandidate('created', new Date('2026-08-13T00:00:00Z'), new Date('2026-08-13T01:00:00Z'), 15)).toBe(false);
  });
});
