'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import { updateImportStatus } from './create-import';
import { createPayment } from '@/actions/payments/create-payment';
import { createExpense } from '@/actions/expenses/create-expense';
import Fuse from 'fuse.js';
import type { BankStatementImport, BankStatementRow, PaymentRecord, Expense } from '@/types/database';
import type { DuplicateCheckResult, ProcessImportOptions, ProcessImportResult } from './types';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { PERMISSIONS } from '@/lib/auth/action-roles';
// ============================================================

// ============================================================
// Check for Duplicate Payment
// ============================================================

export async function checkDuplicate(
  reference: string | null,
  amount: number,
  date: string,
  tolerance_days: number = 1,
  transaction_hash?: string | null,
  description?: string | null
): Promise<DuplicateCheckResult> {
  const supabase = await createServerSupabaseClient();

  // 1. Check by Deterministic Hash first (Strongest match)
  if (transaction_hash) {
    // Check in payment_records
    const { data: byPayHash } = await supabase
      .from('payment_records')
      .select('id, reference_number')
      .eq('transaction_hash', transaction_hash)
      .maybeSingle();

    if (byPayHash) {
      return {
        is_duplicate: true,
        existing_payment_id: byPayHash.id,
        reason: `Duplicate transaction hash in payments`,
      };
    }

    // Check in expenses
    const { data: byExpHash } = await supabase
      .from('expenses')
      .select('id, reference_number')
      .eq('transaction_hash', transaction_hash)
      .maybeSingle();

    if (byExpHash) {
      return {
        is_duplicate: true,
        existing_payment_id: byExpHash.id,
        reason: `Duplicate transaction hash in expenses`,
      };
    }

    // Check in bank_statement_rows (already processed)
    const { data: byRowHash } = await supabase
      .from('bank_statement_rows')
      .select('id, status, payment_id')
      .eq('transaction_hash', transaction_hash)
      .eq('status', 'created')
      .maybeSingle();

    if (byRowHash) {
      return {
        is_duplicate: true,
        existing_payment_id: byRowHash.payment_id || undefined,
        reason: `Duplicate transaction hash (already imported)`,
      };
    }
  }

  // 2. Exact reference match (Existing logic)
  if (reference) {
    const { data: byRef } = await supabase
      .from('payment_records')
      .select('*')
      .eq('reference_number', reference)
      .single();

    if (byRef) {
      return {
        is_duplicate: true,
        existing_payment_id: byRef.id,
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
      existing_payment_id: byAmountDate[0].id,
      reason: `Potential duplicate: same amount (${amount}) within ${tolerance_days} days`,
    };
  }

  // 4. Fuzzy Match description (New capability)
  if (description) {
    const fuzzyMatch = await checkFuzzyDuplicate(description, amount, date);
    if (fuzzyMatch) {
      return {
        is_duplicate: true,
        is_fuzzy: true,
        existing_payment_id: fuzzyMatch.id,
        reason: `Fuzzy description match: "${fuzzyMatch.description}"`,
      };
    }
  }

  return { is_duplicate: false };
}

/**
 * Checks for potential duplicates using fuzzy matching on the description.
 */
async function checkFuzzyDuplicate(
  description: string,
  amount: number,
  date: string,
  threshold: number = 0.3
) {
  const supabase = await createServerSupabaseClient();
  const paymentDate = new Date(date);
  const startDate = new Date(paymentDate);
  startDate.setDate(startDate.getDate() - 7); // Wider window for fuzzy checks
  const endDate = new Date(paymentDate);
  endDate.setDate(endDate.getDate() + 7);

  // Fetch candidate payments with same amount but different descriptions
  const { data: candidates } = await supabase
    .from('payment_records')
    .select('id, description, payment_date')
    .eq('amount', amount)
    .gte('payment_date', startDate.toISOString().split('T')[0])
    .lte('payment_date', endDate.toISOString().split('T')[0]);

  if (!candidates || candidates.length === 0) return null;

  const fuse = new Fuse(candidates, {
    keys: ['description'],
    threshold,
    includeScore: true,
  });

  const results = fuse.search(description);

  if (results.length > 0 && results[0].score! <= threshold) {
    return candidates.find(c => c.id === results[0].item.id);
  }

  return null;
}

// ============================================================
// Process Import - Create Payments
// ============================================================

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
      created_payments_count: 0,
      created_expenses_count: 0,
      skipped_count: 0,
      error_count: 1,
      errors: [{ row_id: '', error: 'Import not found' }],
      import_id,
    };
  }

  if (!['processing', 'awaiting_approval', 'approved'].includes(importData.status)) {
    return {
      success: false,
      created_count: 0,
      created_payments_count: 0,
      created_expenses_count: 0,
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
      created_payments_count: 0,
      created_expenses_count: 0,
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
      created_payments_count: 0,
      created_expenses_count: 0,
      skipped_count: importData.total_rows,
      error_count: 0,
      errors: [],
      import_id,
    };
  }

  const result: ProcessImportResult = {
    success: true,
    created_count: 0,
    created_payments_count: 0,
    created_expenses_count: 0,
    skipped_count: 0,
    error_count: 0,
    errors: [],
    import_id,
  };

  // Process each row
  for (const row of rows) {
    // Check for explicit matches first
    const isDebit = row.transaction_type === 'debit';
    const hasManualMatch = row.matched_resident_id || row.matched_project_id || row.matched_petty_cash_account_id || row.matched_expense_category_id;

    // Skip if no match found (and we are skipping unmatched)
    if (!hasManualMatch && !row.tag_id && skip_unmatched) {
      // Debits might auto-match via tags, but if no tag and no manual assignment, skip
      if (isDebit && !row.tag_id) {
        result.skipped_count++;
        await supabase.from('bank_statement_rows').update({ status: 'skipped' }).eq('id', row.id);
        continue;
      }
      // Credits MUST have a match
      if (!isDebit) {
        result.skipped_count++;
        await supabase.from('bank_statement_rows').update({ status: 'skipped' }).eq('id', row.id);
        continue;
      }
    }

    // Skip if no resident matched (only for credits, unless matched to other types)
    if (!isDebit && !hasManualMatch) {
      // Check if it's a credit but not matched to anything
      if (skip_unmatched) {
        result.skipped_count++;
        await supabase
          .from('bank_statement_rows')
          .update({ status: 'skipped' })
          .eq('id', row.id);
        continue;
      } else {
        result.error_count++;
        result.errors.push({ row_id: row.id, error: 'No assignment matched' });
        await supabase
          .from('bank_statement_rows')
          .update({ status: 'error', error_message: 'No assignment matched' })
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

    // Check for duplicates (only for residential payments/credits)
    if (!isDebit && row.matched_resident_id && skip_duplicates && row.transaction_date) {
      const dupCheck = await checkDuplicate(
        row.reference,
        row.amount || 0,
        row.transaction_date || '',
        duplicate_tolerance_days,
        row.transaction_hash,
        row.description
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

    try {
      if (row.matched_petty_cash_account_id) {
        // ============================================================
        // Handle Petty Cash Assignment (Credit or Debit)
        // ============================================================
        const { replenishPettyCashAccount } = await import('@/actions/finance/petty-cash');

        // If Credit: Income to Petty Cash (Increase Balance)
        // If Debit: Bank -> Petty Cash (Increase Balance)
        // Both cases effectively "Fund" the petty cash from the bank's perspective in this context
        // OR user meant "Expenses paid via Petty Cash"?
        // Given "Income to petty cash inflow" -> Increase.
        // Given "Transfer to Petty Cash" (Debit) -> Increase.

        const amount = Math.abs(row.amount);
        const replenishResult = await replenishPettyCashAccount(
          row.matched_petty_cash_account_id,
          amount,
          `Imported: ${row.description || 'Bank Transfer'}`
        );

        if (!replenishResult.success) {
          throw new Error(replenishResult.error || 'Failed to update petty cash');
        }

        // Update row status
        await supabase
          .from('bank_statement_rows')
          .update({
            status: 'created',
            payment_id: row.matched_petty_cash_account_id, // Store account ID as reference
          })
          .eq('id', row.id);

        result.created_count++;

      } else if (isDebit) {
        // ============================================================
        // Handle DEBIT transaction - Create Expense
        // ============================================================

        // Get expense category - use directly matched category
        // Note: Auto-matching happens during the matching phase (match-residents.ts)
        // Here we only use what was already matched or assigned
        let categoryId: string | null = row.matched_expense_category_id;

        // If no category assigned, use miscellaneous category as fallback
        if (!categoryId) {
          const { data: miscCategory } = await supabase
            .from('expense_categories')
            .select('id')
            .eq('name', 'Bank Import - Miscellaneous')
            .single();

          categoryId = miscCategory?.id || null;
        }

        if (!categoryId) {
          throw new Error('No expense category found for bank import. Please add a "Bank Import - Miscellaneous" category.');
        }

        // Create the expense record
        const expense = await createExpense({
          amount: Math.abs(row.amount), // Ensure positive amount
          category_id: categoryId,
          expense_date: row.transaction_date || new Date().toISOString().split('T')[0],
          description: row.description || 'Bank statement import',
          status: 'paid',
          source_type: 'bank_import',
          payment_method: 'bank_transfer',
          is_verified: true,
          bank_row_id: row.id,
          project_id: row.matched_project_id || undefined, // Add Project ID if matched
        });

        // Update row status with expense_id (we'll store in payment_id field for now)
        await supabase
          .from('bank_statement_rows')
          .update({
            status: 'created',
            payment_id: expense.id, // Reuse payment_id field for the expense ID
          })
          .eq('id', row.id);

        result.created_expenses_count++;
        result.created_count++;
      } else {
        // ============================================================
        // Handle CREDIT transaction - Create Payment (existing logic)
        // ============================================================

        // Ensure we have a resident match if we got here
        if (!row.matched_resident_id) {
          throw new Error('Resident matching required for payment creation');
        }

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
          is_verified: true, // Bank statement imports are auto-verified
          bank_row_id: row.id,
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

        result.created_payments_count++;
        result.created_count++;
      }
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

  return result; // Early return handled by surrounding code, but here we just exit loop and return result


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

  // Notify admins if there are rows needing manual review or if import completes
  if (result.skipped_count > 0 || result.error_count > 0) {
    await notifyAdmins({
      title: 'Bank Import Review Needed',
      body: `Bank import ${import_id.slice(0, 8)} has ${result.skipped_count} skipped rows and ${result.error_count} errors.`,
      category: 'payment',
      actionUrl: `/payments/import/${import_id}`,
      priority: 'normal',
      requiredPermission: PERMISSIONS.IMPORTS_REVIEW,
    });
  }

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

  // Notify admins that an import is awaiting approval
  await notifyAdmins({
    title: 'Bank Import Awaiting Approval',
    body: `Bank import ${import_id.slice(0, 8)} has been submitted for approval.`,
    category: 'payment',
    actionUrl: `/payments/import/${import_id}`,
    priority: 'high',
    requiredPermission: PERMISSIONS.IMPORTS_APPROVE,
  });

  return { error: null };
}
