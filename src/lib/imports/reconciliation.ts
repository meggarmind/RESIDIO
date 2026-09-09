export function calculateImportReconciliation(
  rows: Array<{ amount: number | string | null; transaction_type: string; status: string }>,
  paymentsCreatedTotal: number,
  expensesCreatedTotal: number
) {
  const bankCreditsTotal = rows.filter((row) => row.transaction_type === 'credit').reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const bankDebitsTotal = rows.filter((row) => row.transaction_type === 'debit').reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const unmatched = rows.filter((row) => row.status === 'unmatched' || row.status === 'skipped');
  const unmatchedCredits = unmatched.filter((row) => row.transaction_type === 'credit').length;
  const unmatchedDebits = unmatched.filter((row) => row.transaction_type === 'debit').length;

  return {
    bankCreditsTotal,
    bankDebitsTotal,
    paymentsCreatedTotal,
    expensesCreatedTotal,
    creditsDifference: bankCreditsTotal - paymentsCreatedTotal,
    debitsDifference: bankDebitsTotal - expensesCreatedTotal,
    unmatchedRows: unmatched.length,
    unmatchedCredits,
    unmatchedDebits,
  };
}
