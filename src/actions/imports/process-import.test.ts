import { describe, expect, it } from 'vitest';
import { calculateImportReconciliation } from './process-import';

describe('calculateImportReconciliation', () => {
  it('compares bank totals with created records and counts unmatched rows', () => {
    expect(calculateImportReconciliation([
      { amount: '100', transaction_type: 'credit', status: 'created' },
      { amount: 40, transaction_type: 'credit', status: 'unmatched' },
      { amount: 70, transaction_type: 'debit', status: 'skipped' },
    ], 100, 50)).toEqual({
      bankCreditsTotal: 140,
      bankDebitsTotal: 70,
      paymentsCreatedTotal: 100,
      expensesCreatedTotal: 50,
      creditsDifference: 40,
      debitsDifference: 20,
      unmatchedRows: 2,
      unmatchedCredits: 1,
      unmatchedDebits: 1,
    });
  });
});
