/**
 * Server-only helper that moves a bank_statement_imports row to a new status.
 *
 * Deliberately NOT a server-action module (no directive): it used to be an exported action
 * guarded only by IMPORTS_CREATE that accepted any status, so a creator could jump an import
 * straight to 'awaiting_approval' or 'completed' and skip the maker-checker flow. It is now
 * internal. Callers are server actions that have already passed their own authorizePermission()
 * guard (processImport: IMPORTS_REVIEW) and audit the event themselves. See #556 item 5.
 *
 * Only the transitions this helper is actually used for are allowed. Other lifecycle steps
 * (pending -> processing, processing -> awaiting_approval, awaiting_approval -> approved/rejected)
 * are written directly, with their own permission checks, by their own actions.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { BankStatementImport, ImportStatus } from '@/types/database';

export const IMPORT_STATUS_TRANSITIONS: Readonly<Record<ImportStatus, readonly ImportStatus[]>> = {
  pending: [],
  // processImport may run on an import in any of these three states and finishes it.
  processing: ['completed', 'failed'],
  awaiting_approval: ['completed', 'failed'],
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
  const { error } = await supabase
    .from('bank_statement_imports')
    .update(updateData)
    .eq('id', import_id)
    .eq('status', from);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
