'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

// ============================================================
// Reset Failed Import (#708)
// ============================================================

/**
 * Moves a failed bank statement import back to review (`processing`) so it can be submitted
 * and approved again. Owner decision on #668 Q4: a reset, not an automatic retry.
 *
 * The submitter, approver and their timestamps are cleared, so maker-checker runs again and a
 * previous approval cannot be reused. Rows already `created` are never written, so they are
 * never paid twice; this import's `error` rows go back to `unmatched` for reviewers to re-match.
 *
 * submitted_by / submitted_at (#628) are not in the generated types yet, hence the cast.
 * remove after db:types regeneration (#628)
 */
export async function resetFailedImport(
  import_id: string
): Promise<{ createdRows: number; rowsRequeued: number; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const auth = await authorizePermission(PERMISSIONS.IMPORTS_RESET);
  if (!auth.authorized) {
    return { createdRows: 0, rowsRequeued: 0, error: auth.error || 'Unauthorized' };
  }

  const { data: importData, error: fetchError } = await supabase
    .from('bank_statement_imports')
    .select('*')
    .eq('id', import_id)
    .single();

  if (fetchError || !importData) {
    return { createdRows: 0, rowsRequeued: 0, error: 'Import not found' };
  }

  if (importData.status !== 'failed') {
    return { createdRows: 0, rowsRequeued: 0, error: 'Only a failed import can be reset' };
  }

  const { count, error: countError } = await supabase
    .from('bank_statement_rows')
    .select('id', { count: 'exact', head: true })
    .eq('import_id', import_id)
    .eq('status', 'created');

  if (countError) {
    return { createdRows: 0, rowsRequeued: 0, error: countError.message };
  }
  const createdRows = count ?? 0;

  // Guarded on 'failed' so a racing request cannot reset an import that has moved on
  const { data: updated, error } = await supabase
    .from('bank_statement_imports')
    .update({
      status: 'processing',
      submitted_by: null,
      submitted_at: null,
      approved_by: null,
      approved_at: null,
      completed_at: null,
      import_summary: null,
    } as { status: 'processing' })
    .eq('id', import_id)
    .eq('status', 'failed')
    .select('id');

  if (error) {
    return { createdRows: 0, rowsRequeued: 0, error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { createdRows: 0, rowsRequeued: 0, error: 'Import status changed, please refresh and try again' };
  }

  const { data: requeued, error: requeueError } = await supabase
    .from('bank_statement_rows')
    .update({ status: 'unmatched' })
    .eq('import_id', import_id)
    .eq('status', 'error')
    .select('id');

  if (requeueError) {
    return { createdRows, rowsRequeued: 0, error: requeueError.message };
  }
  const rowsRequeued = requeued?.length ?? 0;

  await logAudit({
    action: 'UPDATE',
    entityType: 'bank_statement_imports',
    entityId: import_id,
    entityDisplay: `Import: ${importData.file_name}`,
    oldValues: { status: 'failed' },
    newValues: { status: 'processing', rows_already_created: createdRows, rows_requeued: rowsRequeued },
    description: `Failed import reset for review; ${createdRows} row(s) already created were left untouched, ${rowsRequeued} errored row(s) returned to unmatched`,
  });

  return { createdRows, rowsRequeued, error: null };
}
