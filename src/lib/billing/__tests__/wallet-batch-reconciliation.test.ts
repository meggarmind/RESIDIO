import { describe, expect, it } from 'vitest';
import { reconcileWalletPaymentBatch } from '@/lib/billing/wallet-batch-reconciliation';

const baseBatch = {
  batchId: 'batch-1',
  batchAmount: 50000,
  batchPeriodStart: '2025-09-01',
  batchPeriodEnd: '2025-09-30',
  items: [
    {
      invoiceId: 'invoice-1',
      amountAllocated: 50000,
      periodStart: '2025-09-01',
      periodEnd: '2025-09-30',
      statusAfter: 'paid' as const,
      snapshotAvailable: true,
      walletTransactionId: 'tx-1',
    },
  ],
  walletTransactions: [
    { id: 'tx-1', type: 'debit' as const, amount: 50000 },
  ],
};

describe('wallet payment batch reconciliation', () => {
  it('returns no findings for a consistent fully paid batch', () => {
    expect(reconcileWalletPaymentBatch(baseBatch)).toEqual([]);
  });

  it('flags a batch amount mismatch', () => {
    const findings = reconcileWalletPaymentBatch({ ...baseBatch, batchAmount: 60000 });
    expect(findings.map((finding) => finding.code)).toContain('amount_mismatch');
  });

  it('does not treat a partial allocation outside the full period as a period mismatch', () => {
    const findings = reconcileWalletPaymentBatch({
      ...baseBatch,
      items: [
        ...baseBatch.items,
        {
          invoiceId: 'invoice-2',
          amountAllocated: 10000,
          periodStart: '2025-10-01',
          periodEnd: '2025-10-31',
          statusAfter: 'partially_paid' as const,
          snapshotAvailable: true,
          walletTransactionId: 'tx-2',
        },
      ],
      walletTransactions: [
        ...baseBatch.walletTransactions,
        { id: 'tx-2', type: 'debit' as const, amount: 10000 },
      ],
    });
    expect(findings.map((finding) => finding.code)).not.toContain('period_mismatch');
  });

  it('flags missing snapshots and missing or incorrect wallet transactions', () => {
    const findings = reconcileWalletPaymentBatch({
      ...baseBatch,
      items: [{ ...baseBatch.items[0], snapshotAvailable: false, walletTransactionId: null }],
      walletTransactions: [],
    });
    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'missing_snapshot',
      'transaction_mismatch',
    ]));
  });

  it('flags a full-period header that does not match paid item periods', () => {
    const findings = reconcileWalletPaymentBatch({
      ...baseBatch,
      batchPeriodStart: '2025-08-01',
    });
    expect(findings.map((finding) => finding.code)).toContain('period_mismatch');
  });
});
