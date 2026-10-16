/**
 * Server-only helper that moves a bank_statement_imports row to a new status.
 *
 * Deliberately NOT a server-action module (no directive): it used to be an exported action
 * guarded only by IMPORTS_CREATE that accepted any status, so a creator could jump an import
 * straight to 'awaiting_approval' or 'completed' and skip the maker-checker flow. It is now
 * internal. Callers are server actions that have already passed their own authorizePermission()
 * guard (processImport: IMPORTS_REVIEW). The helper audits each successful status change itself
 * (UPDATE); a caller's own entry (processImport's GENERATE) is a separate event. See #556 item 5.
 *
 * Only the transitions this helper is actually used for are allowed. Other lifecycle steps
 * (pending -> processing, processing -> awaiting_approval, awaiting_approval -> approved/rejected)
 * are written directly, with their own permission checks, by their own actions.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import type { BankStatementImport, ImportStatus } from '@/types/database';

export const IMPORT_STATUS_TRANSITIONS: Readonly<Record<ImportStatus, readonly ImportStatus[]>> = {
  pending: [],
  // processImport runs only on an approved import (maker-checker, #628) and finishes it.
  // processing and awaiting_approval have no way out through this helper.
  processing: [],
  awaiting_approval: [],
  approved: ['completed', 'failed'],
  completed: [],
  failed: [],
  rejected: [],
};

export function isAllowedImportStatusTransition(from: ImportStatus, to: ImportStatus): boolean {
  return IMPORT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export type UpdateImportStatusParams = {
  import_id: string;
  status: BankStatementImport['status'];
  matched_rows?: number;
  created_rows?: number;
  skipped_rows?: number;
  error_rows?: number;
  import_summary?: Record<string, unknown>;
};

export async function updateImportStatus(params: UpdateImportStatusParams): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { import_id, status, matched_rows, created_rows, skipped_rows, error_rows, import_summary } = params;

  const { data: current, error: readError } = await supabase
    .from('bank_statement_imports')
    .select('status')
    .eq('id', import_id)
    .single();

  if (readError || !current) {
    return { error: readError?.message || 'Import not found' };
  }

  const from = current.status as ImportStatus;
  if (!isAllowedImportStatusTransition(from, status)) {
    return { error: `Invalid import status transition: ${from} -> ${status}` };
  }

  const updateData: Record<string, unknown> = { status };

  if (matched_rows !== undefined) updateData.matched_rows = matched_rows;
  if (created_rows !== undefined) updateData.created_rows = created_rows;
  if (skipped_rows !== undefined) updateData.skipped_rows = skipped_rows;
  if (error_rows !== undefined) updateData.error_rows = error_rows;
  if (import_summary !== undefined) updateData.import_summary = import_summary;

  if (status === 'completed' || status === 'failed') {
    updateData.completed_at = new Date().toISOString();
  }

  // Guard on the status we validated against so a concurrent change cannot slip past the table.
  // PostgREST reports no error when zero rows match, so ask for the rows back and check.
  const { data: updated, error } = await supabase
    .from('bank_statement_imports')
    .update(updateData)
    .eq('id', import_id)
    .eq('status', from)
    .select('id, file_name');

  if (error) {
    return { error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { error: 'Import status changed concurrently, no update applied' };
  }

  // import_summary is left out of the audit entry: it can be large
  const auditValues = { ...updateData };
  delete auditValues.import_summary;
  await logAudit({
    action: 'UPDATE',
    entityType: 'bank_statement_imports',
    entityId: import_id,
    entityDisplay: updated[0]?.file_name || `Import ${import_id.slice(0, 8)}`,
    newValues: auditValues,
    description: `Import status set to ${status}`,
  });

  return { error: null };
}
