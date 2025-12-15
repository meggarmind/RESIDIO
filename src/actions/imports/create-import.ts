'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import type { BankStatementImport, BankStatementRow, ColumnMapping, TransactionFilter } from '@/types/database';
import type { ParsedRow } from '@/lib/validators/import';

// ============================================================
// Response Types
// ============================================================

export interface CreateImportResponse {
  data: BankStatementImport | null;
  error: string | null;
}

export interface CreateImportRowsResponse {
  count: number;
  error: string | null;
}

// ============================================================
// Create Import Session
// ============================================================

export interface CreateImportParams {
  file_name: string;
  file_type: 'csv' | 'xlsx';
  bank_account_id: string;
  bank_name?: string;
  transaction_filter?: TransactionFilter;
  total_rows: number;
  column_mapping: ColumnMapping;
}

export async function createImport(params: CreateImportParams): Promise<CreateImportResponse> {
  const supabase = await createServerSupabaseClient();

  const {
    file_name,
    file_type,
    bank_account_id,
    bank_name = 'FirstBank',
    transaction_filter = 'credit',
    total_rows,
    column_mapping,
  } = params;

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

export interface CreateImportRowsParams {
  import_id: string;
  rows: ParsedRow[];
}

export async function createImportRows(params: CreateImportRowsParams): Promise<CreateImportRowsResponse> {
  const supabase = await createServerSupabaseClient();

  const { import_id, rows } = params;

  if (rows.length === 0) {
    return { count: 0, error: null };
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
      return {
        count: totalInserted,
        error: `Failed to insert rows ${i + 1}-${i + batch.length} after 3 retries: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }

    totalInserted += batch.length;
  }

  // Update import session status
  await supabase
    .from('bank_statement_imports')
    .update({ status: 'processing' })
    .eq('id', import_id);

  return {
    count: totalInserted,
    error: null,
  };
}

// ============================================================
// Update Import Status
// ============================================================

export interface UpdateImportStatusParams {
  import_id: string;
  status: BankStatementImport['status'];
  matched_rows?: number;
  created_rows?: number;
  skipped_rows?: number;
  error_rows?: number;
  import_summary?: Record<string, unknown>;
}

export async function updateImportStatus(params: UpdateImportStatusParams): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const {
    import_id,
    status,
    matched_rows,
    created_rows,
    skipped_rows,
    error_rows,
    import_summary,
  } = params;

  const updateData: Record<string, unknown> = { status };

  if (matched_rows !== undefined) updateData.matched_rows = matched_rows;
  if (created_rows !== undefined) updateData.created_rows = created_rows;
  if (skipped_rows !== undefined) updateData.skipped_rows = skipped_rows;
  if (error_rows !== undefined) updateData.error_rows = error_rows;
  if (import_summary !== undefined) updateData.import_summary = import_summary;

  if (status === 'completed' || status === 'failed') {
    updateData.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('bank_statement_imports')
    .update(updateData)
    .eq('id', import_id);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

// ============================================================
// Delete Import (for cleanup)
// ============================================================

export async function deleteImport(import_id: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

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
