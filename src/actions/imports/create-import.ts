'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { findMatchingTag } from '@/lib/imports/auto-tag';
import type { BankStatementImport, BankStatementRow, ColumnMapping, TransactionFilter, TransactionTag, TransactionTagType } from '@/types/database';
import type { ParsedRow } from '@/lib/validators/import';
import { generateTransactionHash } from '@/lib/utils/hashing';
import { MAX_IMPORT_ROWS } from '@/lib/uploads';

// Row numbers per auto-tag update; keeps the `.in()` filter well under URL length limits.
const AUTO_TAG_UPDATE_CHUNK = 200;

// ============================================================
// Response Types
// ============================================================

type CreateImportResponse = {
  data: BankStatementImport | null;
  error: string | null;
}

type CreateImportRowsResponse = {
  count: number;
  /** Lines left out because the same fingerprint (transaction_hash) is already stored. */
  skipped?: number;
  error: string | null;
}

// ============================================================
// Create Import Session
// ============================================================

type CreateImportParams = {
  file_name: string;
  file_type: 'csv' | 'xlsx';
  bank_account_id: string;
  bank_name?: string;
  transaction_filter?: TransactionFilter;
  total_rows: number;
  column_mapping: ColumnMapping;
  file_hash?: string;
  period_start?: string;
  period_end?: string;
}

export async function createImport(params: CreateImportParams): Promise<CreateImportResponse> {
  const supabase = await createServerSupabaseClient();

  const auth = await authorizePermission(PERMISSIONS.IMPORTS_CREATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const {
    file_name,
    file_type,
    bank_account_id,
    bank_name = 'FirstBank',
    transaction_filter = 'credit',
    total_rows,
    column_mapping,
    file_hash,
    period_start,
    period_end,
  } = params;

  if (!Number.isInteger(total_rows) || total_rows < 0 || total_rows > MAX_IMPORT_ROWS) {
    return { data: null, error: `An import can contain at most ${MAX_IMPORT_ROWS} rows` };
  }

  // Verify bank account exists
  const { data: bankAccount, error: bankError } = await supabase
    .from('estate_bank_accounts')
    .select('id, account_number, bank_name')
    .eq('id', bank_account_id)
    .single();

  if (bankError || !bankAccount) {
    return {
      data: null,
      error: 'Invalid bank account selected',
    };
  }

  // Check for duplicate file hash if provided
  if (file_hash) {
    const { data: existingImport } = await supabase
      .from('bank_statement_imports')
      .select('id, created_at')
      .eq('file_hash', file_hash)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingImport) {
      return {
        data: null,
        error: `This file has already been imported successfully on ${new Date(existingImport.created_at).toLocaleDateString()}`,
      };
    }
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  // Create import session
  const { data, error } = await supabase
    .from('bank_statement_imports')
    .insert({
      file_name,
      file_type,
      bank_account_id,
      bank_name: bankAccount.bank_name || bank_name,
      transaction_filter,
      total_rows,
      column_mapping,
      status: 'pending',
      created_by: user?.id,
      file_hash,
      period_start,
      period_end,
    })
    .select()
    .single();

  if (error) {
    return {
      data: null,
      error: error.message,
    };
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'bank_statement_imports',
    entityId: data.id,
    entityDisplay: `Import: ${file_name}`,
    newValues: {
      file_name,
      file_type,
      bank_account: bankAccount.account_number,
      total_rows,
    },
  });

  return {
    data: data as BankStatementImport,
    error: null,
  };
}

// ============================================================
// Retry Helper with Exponential Backoff
// ============================================================

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Retry attempt ${attempt + 1}/${maxRetries} failed:`, lastError.message);
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt); // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ============================================================
// Create Import Rows (Batch)
// ============================================================

type CreateImportRowsParams = {
  import_id: string;
  rows: ParsedRow[];
}

// Keep the statement all-or-nothing: remove rows already stored for this import
async function rollbackImportRows(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  import_id: string
): Promise<void> {
  const { error: cleanupError } = await supabase
    .from('bank_statement_rows')
    .delete()
    .eq('import_id', import_id);
  if (cleanupError) {
    console.error('[createImportRows] Failed to roll back partial insert:', cleanupError);
  }
}

export async function createImportRows(params: CreateImportRowsParams): Promise<CreateImportRowsResponse> {
  const supabase = await createServerSupabaseClient();

  const auth = await authorizePermission(PERMISSIONS.IMPORTS_CREATE);
  if (!auth.authorized) {
    return { count: 0, error: auth.error || 'Unauthorized' };
  }

  const { import_id, rows } = params;

  if (rows.length === 0) {
    return { count: 0, error: null };
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    return { count: 0, error: `An import can contain at most ${MAX_IMPORT_ROWS} rows (received ${rows.length})` };
  }

  // Rows are loaded exactly once, straight after createImport (status 'pending'); the write
  // below moves it to 'processing'. Any other status means the import is past that point, and
  // knocking it back to 'processing' would silently void a pending or granted approval.
  const { data: existing, error: existingError } = await supabase
    .from('bank_statement_imports')
    .select('status')
    .eq('id', import_id)
    .single();
  if (existingError || !existing) {
    return { count: 0, error: 'Import not found' };
  }
  if (existing.status !== 'pending') {
    return { count: 0, error: `Cannot add rows to an import with status: ${existing.status}` };
  }

  // Transform parsed rows to database format
  const dbRows = rows.map((row) => ({
    import_id,
    row_number: row.row_number,
    raw_data: row.raw_data,
    transaction_date: row.transaction_date?.toISOString().split('T')[0] ?? null,
    description: row.description,
    amount: row.amount,
    transaction_type: row.transaction_type,
    reference: row.reference,
    status: 'pending',
    transaction_hash: row.description && row.amount && row.transaction_date ? generateTransactionHash({
      date: row.transaction_date,
      amount: row.amount,
      description: row.description,
      reference: row.reference,
    }) : null,
  }));

  // Insert in batches of 100 for better performance
  const batchSize = 100;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (let i = 0; i < dbRows.length; i += batchSize) {
    const batch = dbRows.slice(i, i + batchSize);

    try {
      // Retry with exponential backoff for transient network errors
      // transaction_hash is unique across all imports, so a line already stored (an overlapping
      // statement, or a genuine repeat) is skipped rather than failing the whole upload.
      const stored = await retryWithBackoff(async () => {
        const { data, error } = await supabase
          .from('bank_statement_rows')
          .upsert(batch, { onConflict: 'transaction_hash', ignoreDuplicates: true })
          .select('id');
        if (error) {
          throw new Error(error.message);
        }
        return data?.length ?? 0;
      });
      totalInserted += stored;
      totalSkipped += batch.length - stored;
    } catch (err) {
      await rollbackImportRows(supabase, import_id);
      return {
        count: 0,
        error: `Failed to insert rows ${i + 1}-${i + batch.length} after 3 retries: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }

  }

  // Auto-tag rows based on keywords. The active tags are loaded once per distinct transaction
  // type (at most 2 queries, however many rows), matched in memory, and written back with one
  // update per distinct tag instead of one per row (#649).
  const tagTypes = Array.from(
    new Set(
      dbRows
        .filter((row) => row.description && row.transaction_type)
        .map((row) => row.transaction_type as TransactionTagType)
    )
  );

  const tagsByType = new Map<TransactionTagType, TransactionTag[]>();
  await Promise.all(
    tagTypes.map(async (type) => {
      const { data: tags, error: tagsError } = await supabase
        .from('transaction_tags')
        .select('*')
        .eq('transaction_type', type)
        .eq('is_active', true)
        .order('sort_order')
        .order('name');
      // A failed lookup leaves the rows untagged, as the per-row lookup did.
      tagsByType.set(type, !tagsError && Array.isArray(tags) ? (tags as TransactionTag[]) : []);
    })
  );

  const rowNumbersByTag = new Map<string, number[]>();
  for (const row of dbRows) {
    if (!row.description || !row.transaction_type) continue;
    const { tag } = findMatchingTag(tagsByType.get(row.transaction_type as TransactionTagType), row.description);
    if (!tag) continue;
    const group = rowNumbersByTag.get(tag.id);
    if (group) group.push(row.row_number);
    else rowNumbersByTag.set(tag.id, [row.row_number]);
  }

  await Promise.all(
    Array.from(rowNumbersByTag.entries()).flatMap(([tagId, rowNumbers]) => {
      const updates = [];
      for (let i = 0; i < rowNumbers.length; i += AUTO_TAG_UPDATE_CHUNK) {
        updates.push(
          supabase
            .from('bank_statement_rows')
            .update({ tag_id: tagId, auto_tagged: true })
            .eq('import_id', import_id)
            .in('row_number', rowNumbers.slice(i, i + AUTO_TAG_UPDATE_CHUNK))
        );
      }
      return updates;
    })
  );

  // Update import session status, guarded on the 'pending' status read above so a concurrent
  // change cannot be overwritten. PostgREST reports no error when zero rows match, so ask for
  // the rows back. A failed or lost write rolls the inserted rows back, as a failed insert does.
  const { data: statusUpdated, error: statusError } = await supabase
    .from('bank_statement_imports')
    .update({ status: 'processing' })
    .eq('id', import_id)
    .eq('status', 'pending')
    .select('id');
  if (statusError || !statusUpdated || statusUpdated.length === 0) {
    await rollbackImportRows(supabase, import_id);
    return {
      count: 0,
      error: statusError ? statusError.message : 'Import status changed, please refresh and try again',
    };
  }

  // One audit entry per call (not per row)
  await logAudit({
    action: 'CREATE',
    entityType: 'bank_statement_imports',
    entityId: import_id,
    entityDisplay: `Import rows: ${totalInserted}`,
    newValues: { rows_created: totalInserted, rows_skipped_duplicate: totalSkipped, status: 'processing' },
  });

  return {
    count: totalInserted,
    skipped: totalSkipped,
    error: null,
  };
}

// ============================================================
// Delete Import (for cleanup)
// ============================================================

export async function deleteImport(import_id: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const auth = await authorizePermission(PERMISSIONS.IMPORTS_CREATE);
  if (!auth.authorized) {
    return { error: auth.error || 'Unauthorized' };
  }

  // Get import info for audit
  const { data: importData, error: fetchError } = await supabase
    .from('bank_statement_imports')
    .select('*')
    .eq('id', import_id)
    .single();

  if (fetchError) {
    return { error: 'Import not found' };
  }

  // Can only delete pending or failed imports
  if (!['pending', 'failed', 'rejected'].includes(importData.status)) {
    return { error: 'Can only delete pending, failed, or rejected imports' };
  }

  // Delete rows first (cascade should handle this, but be explicit)
  await supabase.from('bank_statement_rows').delete().eq('import_id', import_id);

  // Delete import
  const { error } = await supabase.from('bank_statement_imports').delete().eq('id', import_id);

  if (error) {
    return { error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'DELETE',
    entityType: 'bank_statement_imports',
    entityId: import_id,
    entityDisplay: `Import: ${importData.file_name}`,
    oldValues: importData,
  });

  return { error: null };
}
