/**
 * Returns the signed annual balance used by the resident transaction summary.
 * Positive values are unpaid invoice obligations; negative values are wallet
 * surpluses that offset outstanding balances in the account total.
 */
export function calculateOutstandingDebit(invoiceTotal: number, annualCredits: number): number {
  return invoiceTotal - annualCredits;
}

export function sumOutstandingDebits(outstandingDebits: number[]): number {
  return outstandingDebits.reduce((total, outstandingDebit) => total + outstandingDebit, 0);
}
