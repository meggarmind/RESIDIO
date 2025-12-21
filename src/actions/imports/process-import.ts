'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import type { BankStatementImport, BankStatementRow, PaymentRecord } from '@/types/database';
import { createPayment } from '@/actions/payments/create-payment';
import { updateImportStatus } from './create-import';

// ============================================================
// Response Types
// ============================================================

type ProcessImportResult = {
  success: boolean;
  created_count: number;
  skipped_count: number;
  error_count: number;
  errors: Array<{ row_id: string; error: string }>;
  import_id: string;
}

type DuplicateCheckResult = {
  is_duplicate: boolean;
  existing_payment?: PaymentRecord;
  reason?: string;
}

// ============================================================
// Check for Duplicate Payment
// ============================================================

export async function checkDuplicate(
  reference: string | null,
  amount: number,
  date: string,
  tolerance_days: number = 1
): Promise<DuplicateCheckResult> {
  const supabase = await createServerSupabaseClient();

  // Check by exact reference match first
  if (reference) {
    const { data: byRef } = await supabase
      .from('payment_records')
      .select('*')
      .eq('reference_number', reference)
      .single();

    if (byRef) {
      return {
        is_duplicate: true,
        existing_payment: byRef as PaymentRecord,
        reason: `Duplicate reference: ${reference}`,
      };
    }
  }

  // Check by amount + date within tolerance
  const paymentDate = new Date(date);
  const startDate = new Date(paymentDate);
  startDate.setDate(startDate.getDate() - tolerance_days);
  const endDate = new Date(paymentDate);
  endDate.setDate(endDate.getDate() + tolerance_days);

  const { data: byAmountDate } = await supabase
    .from('payment_records')
    .select('*')
    .eq('amount', amount)
    .gte('payment_date', startDate.toISOString().split('T')[0])
    .lte('payment_date', endDate.toISOString().split('T')[0])
    .limit(1);

  if (byAmountDate && byAmountDate.length > 0) {
    return {
      is_duplicate: true,
      existing_payment: byAmountDate[0] as PaymentRecord,
      reason: `Potential duplicate: same amount (${amount}) within ${tolerance_days} days`,
    };
  }

  return { is_duplicate: false };
}

// ============================================================
// Process Import - Create Payments
// ============================================================

type ProcessImportOptions = {
  import_id: string;
  /** atomic: all-or-nothing, individual: process each row independently */
  mode?: 'atomic' | 'individual';
  /** Skip rows flagged as duplicates */
  skip_duplicates?: boolean;
  /** Skip unmatched rows */
  skip_unmatched?: boolean;
  /** Days tolerance for duplicate detection */
  duplicate_tolerance_days?: number;
}

export async function processImport(options: ProcessImportOptions): Promise<ProcessImportResult> {
  const supabase = await createServerSupabaseClient();

  const {
    import_id,
    mode = 'individual',
    skip_duplicates = true,
    skip_unmatched = true,
    duplicate_tolerance_days = 1,
  } = options;

  // Get import details
  const { data: importData, error: importError } = await supabase
    .from('bank_statement_imports')
    .select('*')
    .eq('id', import_id)
    .single();

  if (importError || !importData) {
    return {
      success: false,
      created_count: 0,
      skipped_count: 0,
      error_count: 1,
      errors: [{ row_id: '', error: 'Import not found' }],
      import_id,
    };
  }

  // Check import status
  if (!['processing', 'awaiting_approval', 'approved'].includes(importData.status)) {
    return {
      success: false,
      created_count: 0,
      skipped_count: 0,
      error_count: 1,
      errors: [{ row_id: '', error: `Cannot process import with status: ${importData.status}` }],
      import_id,
    };
  }

  // Get rows to process
  let rowQuery = supabase
    .from('bank_statement_rows')
    .select('*')
    .eq('import_id', import_id)
    .in('status', ['matched', 'unmatched'])
    .order('row_number');

  if (skip_unmatched) {
    rowQuery = supabase
      .from('bank_statement_rows')
      .select('*')
      .eq('import_id', import_id)
      .eq('status', 'matched')
      .order('row_number');
  }

  const { data: rows, error: rowsError } = await rowQuery;

  if (rowsError) {
    return {
      success: false,
      created_count: 0,
      skipped_count: 0,
      error_count: 1,
      errors: [{ row_id: '', error: rowsError.message }],
      import_id,
    };
  }

  if (!rows || rows.length === 0) {
    await updateImportStatus({
      import_id,
      status: 'completed',
      created_rows: 0,
      skipped_rows: importData.total_rows,
    });

    return {
      success: true,
      created_count: 0,
      skipped_count: importData.total_rows,
      error_count: 0,
      errors: [],
      import_id,
    };
  }

  const result: ProcessImportResult = {
    success: true,
    created_count: 0,
    skipped_count: 0,
    error_count: 0,
    errors: [],
    import_id,
  };

  // Process each row
  for (const row of rows) {
    // Skip if no resident matched
    if (!row.matched_resident_id) {
      if (skip_unmatched) {
        result.skipped_count++;
        await supabase
          .from('bank_statement_rows')
          .update({ status: 'skipped' })
          .eq('id', row.id);
        continue;
      } else {
        result.error_count++;
        result.errors.push({ row_id: row.id, error: 'No resident matched' });
        await supabase
          .from('bank_statement_rows')
          .update({ status: 'error', error_message: 'No resident matched' })
          .eq('id', row.id);
        continue;
      }
    }

    // Skip if no amount
    if (!row.amount || row.amount <= 0) {
      result.skipped_count++;
      await supabase
        .from('bank_statement_rows')
        .update({ status: 'skipped', error_message: 'Invalid amount' })
        .eq('id', row.id);
      continue;
    }

    // Check for duplicates
    if (skip_duplicates && row.transaction_date) {
      const dupCheck = await checkDuplicate(
        row.reference,
        row.amount,
        row.transaction_date,
        duplicate_tolerance_days
      );

      if (dupCheck.is_duplicate) {
        result.skipped_count++;
        await supabase
          .from('bank_statement_rows')
          .update({ status: 'duplicate', error_message: dupCheck.reason })
          .eq('id', row.id);
        continue;
      }
    }

    // Create payment
    try {
      const paymentResult = await createPayment({
        resident_id: row.matched_resident_id,
        amount: row.amount,
        payment_date: new Date(row.transaction_date || new Date()),
        status: 'paid',
        method: 'bank_transfer',
        reference_number: row.reference || undefined,
        notes: `Imported from bank statement: ${row.description}`,
        import_id: import_id,
        import_row_id: row.id,
      });

      if (paymentResult.error) {
        throw new Error(paymentResult.error);
      }

      // Update row status
      await supabase
        .from('bank_statement_rows')
        .update({
          status: 'created',
          payment_id: paymentResult.data?.id,
        })
        .eq('id', row.id);

      result.created_count++;
    } catch (error) {
      result.error_count++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({ row_id: row.id, error: errorMessage });

      await supabase
        .from('bank_statement_rows')
        .update({ status: 'error', error_message: errorMessage })
        .eq('id', row.id);

      // In atomic mode, abort on first error
      if (mode === 'atomic') {
        result.success = false;
        break;
      }
    }
  }

  // Update import final status
  const finalStatus = result.success ? 'completed' : 'failed';
  await updateImportStatus({
    import_id,
    status: finalStatus,
    created_rows: result.created_count,
    skipped_rows: result.skipped_count,
    error_rows: result.error_count,
    import_summary: {
      mode,
      skip_duplicates,
      skip_unmatched,
      errors: result.errors.slice(0, 10), // Store first 10 errors
    },
  });

  // Audit log
  await logAudit({
    action: 'GENERATE',
    entityType: 'bank_statement_imports',
    entityId: import_id,
    entityDisplay: `Import: ${importData.file_name}`,
    newValues: {
      status: finalStatus,
      created_payments: result.created_count,
      skipped_rows: result.skipped_count,
      errors: result.error_count,
    },
  });

  return result;
}

// ============================================================
// Approve Import (for approval workflow)
// ============================================================

export async function approveImport(import_id: string, notes?: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  // Get import
  const { data: importData, error: fetchError } = await supabase
    .from('bank_statement_imports')
    .select('*')
    .eq('id', import_id)
    .single();

  if (fetchError || !importData) {
    return { error: 'Import not found' };
  }

  if (importData.status !== 'awaiting_approval') {
    return { error: 'Import is not awaiting approval' };
  }

  // Update status
  const { error } = await supabase
    .from('bank_statement_imports')
    .update({
      status: 'approved',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', import_id);

  if (error) {
    return { error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'APPROVE',
    entityType: 'bank_statement_imports',
    entityId: import_id,
    entityDisplay: `Import: ${importData.file_name}`,
    newValues: { status: 'approved', notes },
  });

  return { error: null };
}

// ============================================================
// Reject Import (for approval workflow)
// ============================================================

export async function rejectImport(import_id: string, reason: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get import
  const { data: importData, error: fetchError } = await supabase
    .from('bank_statement_imports')
    .select('*')
    .eq('id', import_id)
    .single();

  if (fetchError || !importData) {
    return { error: 'Import not found' };
  }

  if (importData.status !== 'awaiting_approval') {
    return { error: 'Import is not awaiting approval' };
  }

  // Update status
  const { error } = await supabase
    .from('bank_statement_imports')
    .update({
      status: 'rejected',
      import_summary: {
        ...((importData.import_summary as Record<string, unknown>) || {}),
        rejection_reason: reason,
      },
    })
    .eq('id', import_id);

  if (error) {
    return { error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'REJECT',
    entityType: 'bank_statement_imports',
    entityId: import_id,
    entityDisplay: `Import: ${importData.file_name}`,
    newValues: { status: 'rejected', reason },
  });

  return { error: null };
}

// ============================================================
// Submit for Approval
// ============================================================

export async function submitForApproval(import_id: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get import
  const { data: importData, error: fetchError } = await supabase
    .from('bank_statement_imports')
    .select('*')
    .eq('id', import_id)
    .single();

  if (fetchError || !importData) {
    return { error: 'Import not found' };
  }

  if (importData.status !== 'processing') {
    return { error: 'Import must be in processing status to submit for approval' };
  }

  // Update status
  const { error } = await supabase
    .from('bank_statement_imports')
    .update({ status: 'awaiting_approval' })
    .eq('id', import_id);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
