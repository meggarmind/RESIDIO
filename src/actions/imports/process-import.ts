'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { logAudit } from '@/lib/audit/logger';
import { updateImportStatus } from '@/lib/imports/update-import-status';
import { createPaymentCore } from '@/lib/payments/create-payment';
import { createExpense } from '@/actions/expenses/create-expense';
import { updateExpenseStatus } from '@/actions/expenses/update-expense';
import type { BankStatementImport, BankStatementRow, PaymentRecord, Expense } from '@/types/database';
import type { DuplicateCheckResult, ProcessImportOptions, ProcessImportResult } from './types';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { calculateImportReconciliation } from '@/lib/imports/reconciliation';
import { NO_MATCHED_ROWS_MESSAGE, hasMatchedRows } from '@/lib/imports/submit-guard';
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

  // 2. System-wide Duplicate Guardrail (Reference, Amount, Date, Description)
  // Uses centralized settings and logic
  const { checkDuplicateGuardrail } = await import('@/lib/matching/duplicate-matcher');
  const guardrailResult = await checkDuplicateGuardrail({
    amount,
    date,
    reference: reference || undefined,
    description: description || undefined,
  }, 'payment', { toleranceDays: tolerance_days });

  if (guardrailResult.isDuplicate) {
    return {
      is_duplicate: true,
      existing_payment_id: guardrailResult.existingId,
      reason: guardrailResult.reason || 'Duplicate detected by system guardrail',
    };
  }

  return { is_duplicate: false };
}



/**
 * Checks for duplicate expenses (Debits)
 */
export async function checkDuplicateExpense(
  amount: number,
  date: string,
  tolerance_days: number = 2,
  transaction_hash?: string | null,
  description?: string | null
): Promise<DuplicateCheckResult> {
  const supabase = await createServerSupabaseClient();

  // 1. Check by Deterministic Hash
  if (transaction_hash) {
    const { data: byHash } = await supabase
      .from('expenses')
      .select('id, reference_number, status')
      .eq('transaction_hash', transaction_hash)
      .maybeSingle();

    if (byHash) {
      return {
        is_duplicate: true,
        existing_payment_id: byHash.id,
        reason: `Duplicate transaction hash in expenses`,
        existing_status: byHash.status,
        is_expense: true,
      };
    }
  }

  // 2. System-wide Duplicate Guardrail
  const { checkDuplicateGuardrail } = await import('@/lib/matching/duplicate-matcher');
  const guardrailResult = await checkDuplicateGuardrail({
    amount,
    date,
    reference: undefined, // Expenses typically don't use 'reference' for dup checks the same way, or passed undefined if not available
    description: description || undefined,
  }, 'expense', { toleranceDays: tolerance_days });

  if (guardrailResult.isDuplicate && guardrailResult.existingId) {
    // Fetch status for guardrail match
    const { data: existingExpense } = await supabase
      .from('expenses')
      .select('status')
      .eq('id', guardrailResult.existingId)
      .single();

    return {
      is_duplicate: true,
      existing_payment_id: guardrailResult.existingId,
      reason: guardrailResult.reason || 'Duplicate detected by system guardrail',
      existing_status: existingExpense?.status,
      is_expense: true,
    };
  }

  return { is_duplicate: false };
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

  const auth = await authorizePermission(PERMISSIONS.IMPORTS_REVIEW);
  if (!auth.authorized) {
    return {
      success: false,
      created_count: 0,
      created_payments_count: 0,
      created_expenses_count: 0,
      skipped_count: 0,
      error_count: 1,
      errors: [{ row_id: '', error: auth.error || 'Unauthorized' }],
      import_id,
    };
  }

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

  if (importData.status !== 'approved') {
    return {
      success: false,
      created_count: 0,
      created_payments_count: 0,
      created_expenses_count: 0,
      skipped_count: 0,
      error_count: 1,
      errors: [{ row_id: '', error: `Cannot process import with status: ${importData.status}. Only approved imports can be processed.` }],
      import_id,
    };
  }

  // Get rows to process. Paged: a single PostgREST read is capped (1000 rows by default) and a
  // silently truncated read would mark the import completed with rows untouched (#459).
  const processableStatuses = skip_unmatched ? ['matched'] : ['matched', 'unmatched'];
  const { data: rows, error: rowsErrorMessage } = await fetchAllRows((from, to) =>
    supabase
      .from('bank_statement_rows')
      .select('*')
      .eq('import_id', import_id)
      .in('status', processableStatuses)
      .order('row_number')
      .order('id')
      .range(from, to)
  );
  const rowsError = rowsErrorMessage ? { message: rowsErrorMessage } : null;

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
    const emptyRun = await updateImportStatus({
      import_id,
      status: 'completed',
      created_rows: 0,
      skipped_rows: importData.total_rows,
    });

    if (emptyRun.error) {
      console.error('processImport: failed to mark empty import completed', import_id, emptyRun.error);
    }

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
        // Matcher for Petty Cash or Expenses already handled above? 
        // Logic continues...

        // Check for duplicates (Expenses)
        if (skip_duplicates && row.transaction_date) {
          const dupCheck = await checkDuplicateExpense(
            Math.abs(row.amount),
            row.transaction_date,
            duplicate_tolerance_days, // Use configurable tolerance (default 1, plan said 2, passed via options)
            row.transaction_hash,
            row.description
          );

          if (dupCheck.is_duplicate) {
            // Check if we can reconcile a pending expense
            if (dupCheck.existing_status === 'pending' && dupCheck.existing_payment_id) {
              // Reconcile: Update status to 'paid' and link
              await updateExpenseStatus(dupCheck.existing_payment_id, 'paid');

              // Log the reconciliation
              await logAudit({
                action: 'VERIFY',
                entityType: 'expenses',
                entityId: dupCheck.existing_payment_id,
                entityDisplay: `Auto-reconciled via Bank Import: ${row.description}`,
                newValues: { status: 'paid', bank_row_id: row.id },
              });

              // Mark row as created (acting as the verification proof)
              await supabase
                .from('bank_statement_rows')
                .update({
                  status: 'created',
                  payment_id: dupCheck.existing_payment_id,
                  error_message: 'Auto-reconciled with existing pending expense'
                })
                .eq('id', row.id);

              result.created_expenses_count++;
              result.created_count++;
              continue; // Move to next row
            }

            // Otherwise, it's a true duplicate (already paid)
            result.skipped_count++;
            await supabase
              .from('bank_statement_rows')
              .update({ status: 'duplicate', error_message: dupCheck.reason })
              .eq('id', row.id);
            continue;
          }
        }

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

        const paymentResult = await createPaymentCore({
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
        }, { trustedVerification: true });

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

  // Update import final status
  const finalStatus = result.success ? 'completed' : 'failed';
  const finalWrite = await updateImportStatus({
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
  if (finalWrite.error) {
    console.error('processImport: failed to write final import status', import_id, finalWrite.error);
  }

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

  // Compute reconciliation summary from the import rows
  try {
    const { data: allRows } = await supabase
      .from('bank_statement_rows')
      .select('amount, transaction_type, status')
      .eq('import_id', import_id);

    if (allRows) {
      // NOTE: this reconciliation block is unreachable today (early return
      // above, unchanged since 567b5cd) but still type-checked; assertions
      // keep it compiling without altering runtime behavior.
      const rows = allRows!;

      const { data: payments } = await supabase
        .from('payment_records')
        .select('amount')
        .eq('import_id', import_id);

      const paymentsTotal = payments?.reduce((s, p) => s + (Number(p.amount) || 0), 0) ?? 0;

      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('import_id', import_id);

      const expensesTotal = expenses?.reduce((s, e) => s + (Number(e.amount) || 0), 0) ?? 0;

      result.reconciliation = calculateImportReconciliation(rows, paymentsTotal, expensesTotal);
    }
  } catch (e) {
    console.error('[processImport] Reconciliation computing error:', e);
  }

  return result;
}

// ============================================================
// Approve Import (for approval workflow)
// ============================================================

/**
 * submitted_by / submitted_at (#628) are not in the generated types until the migration is
 * applied and `npm run db:types` is re-run, so the typed client would reject them. The cast is
 * confined to these two helpers.
 * remove after db:types regeneration (#628)
 */
function submissionColumns(userId: string | null) {
  return {
    status: 'awaiting_approval' as const,
    submitted_by: userId,
    submitted_at: new Date().toISOString(),
  };
}

function readSubmittedBy(importRow: object): string | null {
  return (importRow as { submitted_by?: string | null }).submitted_by ?? null;
}

export async function approveImport(import_id: string, notes?: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const auth = await authorizePermission(PERMISSIONS.IMPORTS_APPROVE);
  if (!auth.authorized) {
    return { error: auth.error || 'Unauthorized' };
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  // Fail closed (#628): without an identity the self-approval rule cannot be evaluated, so
  // no approval may proceed. authorizePermission already rejects this case; this keeps the
  // rule safe if that ever changes.
  const approverId = user?.id ?? auth.userId ?? null;
  if (!approverId) {
    return { error: 'Unauthorized' };
  }

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

  // Maker != checker (#628): the submitter may not approve their own import. A null
  // submitted_by is a legacy row from before the column existed (none exist on Stage or Prod
  // today) and is allowed through, since there is no submitter to compare with.
  const submittedBy = readSubmittedBy(importData);
  if (submittedBy !== null && submittedBy === approverId) {
    return { error: 'You submitted this import, so a different approver is required' };
  }

  // Update status, guarded on the status checked above so a racing request cannot overwrite it
  const { data: updated, error } = await supabase
    .from('bank_statement_imports')
    .update({
      status: 'approved',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', import_id)
    .eq('status', 'awaiting_approval')
    .select('id');

  if (error) {
    return { error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { error: 'Import status changed, please refresh and try again' };
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
// Deliberately NOT subject to the self-approval rule (#628): a submitter may withdraw their
// own submission by rejecting it.

export async function rejectImport(import_id: string, reason: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const auth = await authorizePermission(PERMISSIONS.IMPORTS_REJECT);
  if (!auth.authorized) {
    return { error: auth.error || 'Unauthorized' };
  }

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

  // Update status, guarded on the status checked above so a racing request cannot overwrite it
  const { data: updated, error } = await supabase
    .from('bank_statement_imports')
    .update({
      status: 'rejected',
      import_summary: {
        ...((importData.import_summary as Record<string, unknown>) || {}),
        rejection_reason: reason,
      },
    })
    .eq('id', import_id)
    .eq('status', 'awaiting_approval')
    .select('id');

  if (error) {
    return { error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { error: 'Import status changed, please refresh and try again' };
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

  const auth = await authorizePermission(PERMISSIONS.IMPORTS_REVIEW);
  if (!auth.authorized) {
    return { error: auth.error || 'Unauthorized' };
  }

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

  // Refuse an import with nothing to approve (#666): at least one matched row is required,
  // the same rule the import wizard applies. Unmatched rows alongside a matched one are allowed.
  const { count: matchedCount, error: countError } = await supabase
    .from('bank_statement_rows')
    .select('id', { count: 'exact', head: true })
    .eq('import_id', import_id)
    .eq('status', 'matched');

  if (countError) {
    return { error: countError.message };
  }
  if (!hasMatchedRows(matchedCount)) {
    return { error: NO_MATCHED_ROWS_MESSAGE };
  }

  // Update status, guarded on the status checked above so a racing request cannot overwrite it
  const { data: updated, error } = await supabase
    .from('bank_statement_imports')
    .update(submissionColumns(auth.userId))
    .eq('id', import_id)
    .eq('status', 'processing')
    .select('id');

  if (error) {
    return { error: error.message };
  }
  if (!updated || updated.length === 0) {
    return { error: 'Import status changed, please refresh and try again' };
  }

  // Audit log (maker step of maker-checker)
  await logAudit({
    action: 'UPDATE',
    entityType: 'bank_statement_imports',
    entityId: import_id,
    entityDisplay: `Import: ${importData.file_name}`,
    oldValues: { status: importData.status },
    newValues: { status: 'awaiting_approval' },
  });

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
