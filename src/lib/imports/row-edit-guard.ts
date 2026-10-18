/**
 * Row-edit lock shared by the row actions in match-residents.ts (#707, owner decision on #668 Q2):
 * once an import is submitted, its rows are what the approver signs off, so they may only change
 * while the import is still under review.
 */
import { IMPORT_STATUS_LABELS, type ImportStatus } from '@/types/database';

export const ROW_EDITABLE_IMPORT_STATUSES: readonly ImportStatus[] = ['pending', 'processing'];

export function isImportRowEditable(status: string | null | undefined): boolean {
  return !!status && (ROW_EDITABLE_IMPORT_STATUSES as readonly string[]).includes(status);
}

export function rowsLockedMessage(status: string | null | undefined): string {
  const label = IMPORT_STATUS_LABELS[status as ImportStatus] ?? status ?? 'unknown';
  return `This import's rows can no longer be changed (status: ${label}). Rows can only be edited before the import is submitted for approval.`;
}
