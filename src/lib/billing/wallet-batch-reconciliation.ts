import { deriveCoveredPeriod } from '@/lib/billing/payment-period';

export type ReconciliationItem = {
  invoiceId: string;
  amountAllocated: number;
  periodStart: string;
  periodEnd: string;
  statusAfter: 'paid' | 'partially_paid' | null;
  snapshotAvailable: boolean;
  walletTransactionId: string | null;
};

export type ReconciliationWalletTransaction = {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
};

export type ReconciliationBatch = {
  batchId: string;
  batchAmount: number;
  batchPeriodStart: string | null;
  batchPeriodEnd: string | null;
  items: ReconciliationItem[];
  walletTransactions: ReconciliationWalletTransaction[];
};

export type WalletBatchFindingCode =
  | 'amount_mismatch'
  | 'period_mismatch'
  | 'missing_snapshot'
  | 'transaction_mismatch';

export type WalletBatchFinding = {
  batchId: string;
  code: WalletBatchFindingCode;
  message: string;
  expected?: number | string | null;
  actual?: number | string | null;
};

const MONEY_TOLERANCE = 0.005;

function amountsDiffer(left: number, right: number) {
  return Math.abs(Number(left) - Number(right)) > MONEY_TOLERANCE;
}

export function reconcileWalletPaymentBatch(batch: ReconciliationBatch): WalletBatchFinding[] {
  const findings: WalletBatchFinding[] = [];
  const allocatedTotal = batch.items.reduce((total, item) => total + Number(item.amountAllocated), 0);

  if (amountsDiffer(batch.batchAmount, allocatedTotal)) {
    findings.push({
      batchId: batch.batchId,
      code: 'amount_mismatch',
      message: 'Batch amount does not equal the sum of invoice allocations',
      expected: allocatedTotal,
      actual: Number(batch.batchAmount),
    });
  }

  const paidPeriod = deriveCoveredPeriod(batch.items
    .filter((item) => item.snapshotAvailable && item.statusAfter === 'paid')
    .map((item) => ({ period_start: item.periodStart, period_end: item.periodEnd })));
  const storedPeriod = batch.batchPeriodStart && batch.batchPeriodEnd
    ? { start: batch.batchPeriodStart, end: batch.batchPeriodEnd }
    : null;

  if ((paidPeriod?.start || null) !== (storedPeriod?.start || null) || (paidPeriod?.end || null) !== (storedPeriod?.end || null)) {
    findings.push({
      batchId: batch.batchId,
      code: 'period_mismatch',
      message: 'Batch period does not match the periods of fully paid allocations',
      expected: paidPeriod ? `${paidPeriod.start} - ${paidPeriod.end}` : null,
      actual: storedPeriod ? `${storedPeriod.start} - ${storedPeriod.end}` : null,
    });
  }

  for (const item of batch.items) {
    if (!item.snapshotAvailable) {
      findings.push({
        batchId: batch.batchId,
        code: 'missing_snapshot',
        message: `Invoice ${item.invoiceId} has no immutable allocation snapshot`,
        actual: item.invoiceId,
      });
    }

    const transaction = item.walletTransactionId
      ? batch.walletTransactions.find((candidate) => candidate.id === item.walletTransactionId)
      : undefined;
    if (!transaction || transaction.type !== 'debit' || amountsDiffer(transaction.amount, item.amountAllocated)) {
      findings.push({
        batchId: batch.batchId,
        code: 'transaction_mismatch',
        message: `Invoice ${item.invoiceId} does not have a matching wallet debit`,
        expected: Number(item.amountAllocated),
        actual: transaction ? Number(transaction.amount) : null,
      });
    }
  }

  return findings;
}
