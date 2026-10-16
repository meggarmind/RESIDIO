/**
 * Submit-for-approval rule shared by the server action and the import detail page (#666):
 * an import needs at least one matched row, otherwise there is nothing for an approver to approve.
 */
export const NO_MATCHED_ROWS_MESSAGE = 'No matched rows to process, so there is nothing to submit.';

export function hasMatchedRows(matched: number | null | undefined): boolean {
  return (matched ?? 0) > 0;
}
