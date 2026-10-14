'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { autoTagTransaction } from '@/actions/reference/transaction-tags';
import type { BankStatementImport, BankStatementRow, ColumnMapping, TransactionFilter, TransactionTagType } from '@/types/database';
import type { ParsedRow } from '@/lib/validators/import';
import { generateTransactionHash } from '@/lib/utils/hashing';
import { MAX_IMPORT_ROWS } from '@/lib/uploads';

// ============================================================
// Response Types
// ============================================================

type CreateImportResponse = {
  data: BankStatementImport | null;
  error: string | null;
}

type CreateImportRowsResponse = {
  count: number;
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

  for (let i = 0; i < dbRows.length; i += batchSize) {
    const batch = dbRows.slice(i, i + batchSize);

    try {
      // Retry with exponential backoff for transient network errors
      await retryWithBackoff(async () => {
        const { error } = await supabase.from('bank_statement_rows').insert(batch);
        if (error) {
          throw new Error(error.message);
        }
      });
    } catch (err) {
      // Keep the statement all-or-nothing: remove rows already stored for this import
      const { error: cleanupError } = await supabase
        .from('bank_statement_rows')
        .delete()
        .eq('import_id', import_id);
      if (cleanupError) {
        console.error('[createImportRows] Failed to roll back partial insert:', cleanupError);
      }
      return {
        count: 0,
        error: `Failed to insert rows ${i + 1}-${i + batch.length} after 3 retries: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }

    totalInserted += batch.length;
  }

  // Auto-tag rows based on keywords
  // Process in batches to avoid timeout on large imports
  const autoTagBatchSize = 50;
  for (let i = 0; i < dbRows.length; i += autoTagBatchSize) {
    const batch = dbRows.slice(i, i + autoTagBatchSize);

    // Process rows in parallel within each batch
    const autoTagPromises = batch.map(async (row) => {
      if (!row.description || !row.transaction_type) return null;

      const { tag } = await autoTagTransaction(
        row.description,
        row.transaction_type as TransactionTagType
      );

      if (tag) {
        return {
          row_number: row.row_number,
          tag_id: tag.id,
        };
      }
      return null;
    });

    const results = await Promise.all(autoTagPromises);
    const tagsToApply = results.filter((r): r is { row_number: number; tag_id: string } => r !== null);

    // Batch update rows with their auto-tags
    for (const tagInfo of tagsToApply) {
      await supabase
        .from('bank_statement_rows')
        .update({
          tag_id: tagInfo.tag_id,
          auto_tagged: true,
        })
        .eq('import_id', import_id)
        .eq('row_number', tagInfo.row_number);
    }
  }

  // Update import session status
  await supabase
    .from('bank_statement_imports')
    .update({ status: 'processing' })
    .eq('id', import_id);

  // One audit entry per call (not per row)
  await logAudit({
    action: 'CREATE',
    entityType: 'bank_statement_imports',
    entityId: import_id,
    entityDisplay: `Import rows: ${totalInserted}`,
    newValues: { rows_created: totalInserted, status: 'processing' },
  });

  return {
    count: totalInserted,
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
