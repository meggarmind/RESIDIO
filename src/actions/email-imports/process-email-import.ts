'use server';

/**
 * Email Import Processing Actions
 *
 * Matches email transactions to residents and processes them into payments.
 * Implements high-confidence auto-processing and admin review queue.
 */
import { notifyAdmins } from '@/lib/notifications/admin-notifier';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createMatcher } from '@/lib/matching/resident-matcher';
import { createPayment } from '@/actions/payments/create-payment';
import { extractSenderName } from '@/lib/email-imports/utils';
import { createExpense } from '@/actions/expenses/create-expense';
import { updateEmailImportStatus } from './create-email-import';
import type {
  EmailTransaction,
  ProcessEmailTransactionsOptions,
  ProcessEmailTransactionsResult,
} from '@/types/database';

// ============================================================
// Load Matching Data
// ============================================================

async function loadMatchingData() {
  const adminClient = await createAdminClient();

  // Load residents
  const { data: residents } = await adminClient
    .from('residents')
    .select('id, first_name, last_name, resident_code, phone, email')
    .eq('is_active', true);

  // Load payment aliases (select all fields needed by createMatcher)
  const { data: aliases } = await adminClient
    .from('resident_payment_aliases')
    .select('id, alias_name, resident_id, notes, is_active, created_at, created_by')
    .eq('is_active', true);

  // Load houses with resident assignments
  const { data: houses } = await adminClient
    .from('houses')
    .select(`
      id,
      house_number,
      resident_houses!inner (
        resident_id,
        is_active
      )
    `)
    .eq('resident_houses.is_active', true);

  return {
    residents: residents || [],
    aliases: (aliases || []) as Array<{
      id: string;
      alias_name: string;
      resident_id: string;
      notes: string | null;
      is_active: boolean;
      created_at: string;
      created_by: string | null;
    }>,
    houses: houses || []
  };
}

// ============================================================
// Match Email Transactions
// ============================================================

export async function matchEmailTransactions(
  importId: string
): Promise<{
  matched: number;
  unmatched: number;
  error: string | null;
}> {
  const adminClient = await createAdminClient();

  // Get pending transactions for this import
  const { data: transactions, error: fetchError } = await adminClient
    .from('email_transactions')
    .select('*')
    .eq('email_import_id', importId)
    .eq('status', 'pending');

  if (fetchError || !transactions) {
    return {
      matched: 0,
      unmatched: 0,
      error: fetchError?.message || 'Failed to fetch transactions',
    };
  }

  if (transactions.length === 0) {
    return { matched: 0, unmatched: 0, error: null };
  }

  // Load matching data
  const { residents, aliases, houses } = await loadMatchingData();

  // Create matcher
  const matcher = createMatcher(residents, aliases, houses);

  let matched = 0;
  let unmatched = 0;

  // Match each transaction
  for (const tx of transactions) {
    const emailTx = tx as EmailTransaction;

    // Only match credit transactions (payments coming in)
    if (emailTx.transaction_type === 'credit') {
      const result = matcher.match({
        description: emailTx.description || '',
        amount: Number(emailTx.amount) || 0,
        reference: emailTx.reference || undefined,
      });

      // Update transaction with match result
      await adminClient
        .from('email_transactions')
        .update({
          matched_resident_id: result.resident_id,
          match_confidence: result.confidence,
          match_method: result.method,
          match_details: result.all_matches,
          matched_at: new Date().toISOString(),
          status: result.resident_id ? 'matched' : 'pending',
        })
        .eq('id', emailTx.id);

      if (result.resident_id) {
        matched++;
      } else {
        unmatched++;
      }
    } else if (emailTx.transaction_type === 'debit') {
      // Try to auto-match debits to expense category
      const { autoMatchExpenseCategory } = await import('@/actions/expenses/get-expense-categories');
      const categoryMatch = await autoMatchExpenseCategory(emailTx.description || '');

      if (categoryMatch.category) {
        await adminClient
          .from('email_transactions')
          .update({
            matched_expense_category_id: categoryMatch.category.id,
            match_confidence: 'high',
            match_method: 'keyword',
            matched_at: new Date().toISOString(),
            status: 'matched',
          })
          .eq('id', emailTx.id);
        matched++;
      } else {
        // Explicitly set confidence to 'none' for unmatched debits
        await adminClient
          .from('email_transactions')
          .update({
            match_confidence: 'none',
            status: 'pending',
          })
          .eq('id', emailTx.id);
        unmatched++;
      }
    }
  }

  // Update import counters
  await updateEmailImportStatus({
    importId,
    status: 'processing',
    transactionsMatched: matched,
  });

  return { matched, unmatched, error: null };
}

// ============================================================
// Process Email Transactions (Auto-process + Queue)
// ============================================================

export async function processEmailTransactions(
  importId: string,
  options: ProcessEmailTransactionsOptions = {}
): Promise<ProcessEmailTransactionsResult> {
  const {
    autoProcessHighConfidence = true,
    skipDuplicates = true,
    duplicateToleranceDays = 1,
  } = options;

  // Check permission for manual processing
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_PROCESS);
  if (!auth.authorized) {
    return {
      success: false,
      autoProcessed: 0,
      queuedForReview: 0,
      skipped: 0,
      errored: 0,
      expensesCreated: 0,
      error: auth.error || 'Unauthorized',
    };
  }

  const adminClient = await createAdminClient();

  // Get matched transactions for this import
  const { data: transactions, error: fetchError } = await adminClient
    .from('email_transactions')
    .select('*')
    .eq('email_import_id', importId)
    .in('status', ['matched', 'pending']);

  if (fetchError || !transactions) {
    return {
      success: false,
      autoProcessed: 0,
      queuedForReview: 0,
      skipped: 0,
      errored: 0,
      expensesCreated: 0,
      error: fetchError?.message || 'Failed to fetch transactions',
    };
  }

  const result: ProcessEmailTransactionsResult = {
    success: true,
    autoProcessed: 0,
    queuedForReview: 0,
    skipped: 0,
    errored: 0,
    expensesCreated: 0,
  };

  // 1. Process Matched Credits (Payments)
  const creditTransactions = (transactions || []).filter(tx => tx.transaction_type === 'credit');

  for (const tx of creditTransactions) {
    const emailTx = tx as EmailTransaction;

    // Check for duplicates if enabled
    if (skipDuplicates && emailTx.transaction_date && emailTx.amount) {
      const isDuplicate = await checkDuplicatePayment(
        emailTx.matched_resident_id!,
        Number(emailTx.amount),
        emailTx.transaction_date,
        emailTx.reference,
        duplicateToleranceDays
      );

      if (isDuplicate) {
        await adminClient
          .from('email_transactions')
          .update({
            status: 'skipped',
            skip_reason: 'Duplicate payment detected',
          })
          .eq('id', emailTx.id);

        result.skipped++;
        continue;
      }
    }

    // Determine if auto-processable
    const canAutoProcess =
      autoProcessHighConfidence &&
      emailTx.match_confidence === 'high' &&
      (emailTx.match_method === 'alias' || emailTx.match_method === 'phone');

    if (canAutoProcess) {
      // Auto-process: Create payment
      const paymentResult = await createPaymentFromTransaction(emailTx, auth.userId);

      if (paymentResult.success) {
        await adminClient
          .from('email_transactions')
          .update({
            status: 'auto_processed',
            payment_id: paymentResult.paymentId,
            processed_at: new Date().toISOString(),
          })
          .eq('id', emailTx.id);

        result.autoProcessed++;
      } else {
        await adminClient
          .from('email_transactions')
          .update({
            status: 'error',
            error_message: paymentResult.error,
          })
          .eq('id', emailTx.id);

        result.errored++;
      }
    } else {
      // Not processable automatically (low confidence or not alias/phone match)
      // Queue for manual review if not already matched
      if (emailTx.status !== 'queued_for_review' && emailTx.status !== 'skipped' && emailTx.status !== 'matched') {
        await adminClient
          .from('email_transactions')
          .update({ status: 'queued_for_review' })
          .eq('id', emailTx.id);
      }
      result.queuedForReview++;
    }
  }

  // 2. Process Debits with existing assignments (Expenses/Petty Cash)
  // These might come from high-confidence matching (if we eventually add it) or previous sessions
  const { data: debitTransactions } = await adminClient
    .from('email_transactions')
    .select('*')
    .eq('email_import_id', importId)
    .eq('transaction_type', 'debit')
    .in('status', ['matched', 'queued_for_review', 'pending']);

  if (debitTransactions && debitTransactions.length > 0) {
    for (const tx of debitTransactions) {
      const emailTx = tx as EmailTransaction;

      // Check for duplicates if enabled
      if (skipDuplicates && emailTx.transaction_date && emailTx.amount) {
        const isDuplicate = await checkDuplicateExpense(
          Math.abs(Number(emailTx.amount)),
          emailTx.transaction_date,
          emailTx.reference || null,
          duplicateToleranceDays
        );

        if (isDuplicate) {
          await adminClient
            .from('email_transactions')
            .update({
              status: 'skipped',
              skip_reason: 'Duplicate expense detected',
            })
            .eq('id', emailTx.id);

          result.skipped++;
          continue;
        }
      }

      // Check for assignments
      const hasAssignment = emailTx.matched_expense_category_id ||
        emailTx.matched_project_id ||
        emailTx.matched_petty_cash_account_id;

      if (!hasAssignment) {
        // Leave in queue for review
        if (emailTx.status !== 'queued_for_review') {
          await adminClient.from('email_transactions').update({ status: 'queued_for_review' }).eq('id', emailTx.id);
          result.queuedForReview++;
        }
        continue;
      }

      // Determine if auto-processable (for debits this is just having a high confidence match via keyword or manually matched previously)
      // If it was manually matched (e.g. status='matched' and match_method='manual'), it should be processed.
      // If it was auto-matched (status='matched', method='keyword'), check autoProcessHighConfidence.
      const isAutoMatch = emailTx.match_method === 'keyword';
      const canAutoProcess = !isAutoMatch || (autoProcessHighConfidence && emailTx.match_confidence === 'high');

      if (canAutoProcess) {
        try {
          if (emailTx.matched_petty_cash_account_id) {
            // Petty Cash Replenishment
            const { replenishPettyCashAccount } = await import('@/actions/finance/petty-cash');
            const replenishResult = await replenishPettyCashAccount(
              emailTx.matched_petty_cash_account_id,
              Math.abs(Number(emailTx.amount)),
              `Email import: ${emailTx.description || 'Bank Transfer'}`
            );

            if (!replenishResult.success) {
              throw new Error(replenishResult.error || 'Failed to replenish petty cash');
            }

            await adminClient
              .from('email_transactions')
              .update({
                status: 'auto_processed',
                processed_at: new Date().toISOString(),
              })
              .eq('id', emailTx.id);

            result.autoProcessed++;
            result.expensesCreated++;
          } else {
            // Regular Expense
            const expenseResult = await createExpenseFromTransaction(emailTx, auth.userId);

            if (expenseResult.success) {
              await adminClient
                .from('email_transactions')
                .update({
                  status: 'auto_processed',
                  expense_id: expenseResult.expenseId,
                  processed_at: new Date().toISOString(),
                })
                .eq('id', emailTx.id);

              result.autoProcessed++;
              result.expensesCreated++;
            } else {
              await adminClient
                .from('email_transactions')
                .update({
                  status: 'error',
                  error_message: expenseResult.error,
                })
                .eq('id', emailTx.id);

              result.errored++;
            }
          }
        } catch (error) {
          await adminClient
            .from('email_transactions')
            .update({
              status: 'error',
              error_message: error instanceof Error ? error.message : 'Unknown error rendering debit',
            })
            .eq('id', emailTx.id);
          result.errored++;
        }
      } else {
        // Not auto-processable, ensure it is in review queue
        if (emailTx.status !== 'queued_for_review') {
          await adminClient.from('email_transactions').update({ status: 'queued_for_review' }).eq('id', emailTx.id);
          result.queuedForReview++;
        }
      }
    }
  }

  // Update import status
  await updateEmailImportStatus({
    importId,
    status: result.errored > 0 ? 'failed' : 'completed',
    transactionsAutoProcessed: result.autoProcessed,
    transactionsQueued: result.queuedForReview,
    transactionsSkipped: result.skipped,
    transactionsErrored: result.errored,
  });

  // Audit log
  await logAudit({
    action: 'GENERATE',
    entityType: 'email_imports',
    entityId: importId,
    entityDisplay: `Email Import Processing`,
    newValues: {
      auto_processed: result.autoProcessed,
      queued_for_review: result.queuedForReview,
      skipped: result.skipped,
      errors: result.errored,
    },
  });

  // Notify admins if there are transactions queued for review
  if (result.queuedForReview > 0) {
    await notifyAdmins({
      title: 'Email Transactions Queued',
      body: `${result.queuedForReview} transactions from import ${importId.slice(0, 8)} require manual review.`,
      category: 'payment',
      actionUrl: `/payments/email-imports/${importId}`,
      priority: 'normal',
      requiredPermission: PERMISSIONS.EMAIL_IMPORTS_PROCESS,
    });
  }

  return result;
}

// ============================================================
// Process Single Transaction (Admin Review)
// ============================================================

export async function processSingleTransaction(
  transactionId: string,
  params: {
    residentId?: string;
    expenseCategoryId?: string;
    projectId?: string;
    pettyCashAccountId?: string;
    notes?: string;
    saveAsAlias?: boolean;
    aliasName?: string;
    aliasNotes?: string;
  }
): Promise<{ success: boolean; paymentId?: string; expenseId?: string; error?: string }> {
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_PROCESS);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const adminClient = await createAdminClient();

  // Get transaction
  const { data: transaction, error: fetchError } = await adminClient
    .from('email_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (fetchError || !transaction) {
    return { success: false, error: 'Transaction not found' };
  }

  const emailTx = transaction as EmailTransaction;

  // Validate transaction is processable
  if (!['queued_for_review', 'matched', 'pending', 'error'].includes(emailTx.status)) {
    return { success: false, error: `Cannot process transaction with status: ${emailTx.status}` };
  }

  if (emailTx.transaction_type === 'debit') {
    // ============================================================
    // Handle Debit (Expense or Petty Cash)
    // ============================================================

    if (params.pettyCashAccountId) {
      const { replenishPettyCashAccount } = await import('@/actions/finance/petty-cash');
      const replenishResult = await replenishPettyCashAccount(
        params.pettyCashAccountId,
        Math.abs(Number(emailTx.amount)),
        params.notes || `Email import: ${emailTx.description}`
      );

      if (!replenishResult.success) {
        return { success: false, error: replenishResult.error };
      }

      await adminClient.from('email_transactions').update({
        status: 'processed',
        matched_petty_cash_account_id: params.pettyCashAccountId,
        reviewed_by: auth.userId,
        reviewed_at: new Date().toISOString(),
        review_notes: params.notes,
        processed_at: new Date().toISOString(),
      }).eq('id', transactionId);

      return { success: true };
    }

    const expenseResult = await createExpenseFromTransaction({
      ...emailTx,
      matched_expense_category_id: params.expenseCategoryId || null,
      matched_project_id: params.projectId || null,
    }, auth.userId);

    if (!expenseResult.success) {
      return { success: false, error: expenseResult.error };
    }

    await adminClient.from('email_transactions').update({
      status: 'processed',
      matched_expense_category_id: params.expenseCategoryId,
      matched_project_id: params.projectId,
      expense_id: expenseResult.expenseId,
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
      review_notes: params.notes,
      processed_at: new Date().toISOString(),
    }).eq('id', transactionId);

    return { success: true, expenseId: expenseResult.expenseId };
  }

  // ============================================================
  // Handle Credit (Payment)
  // ============================================================
  if (!params.residentId) {
    return { success: false, error: 'Resident ID required for payment transactions' };
  }

  // Create payment
  const paymentResult = await createPaymentFromTransaction(
    {
      ...emailTx,
      matched_resident_id: params.residentId,
    },
    auth.userId
  );

  if (!paymentResult.success) {
    return { success: false, error: paymentResult.error };
  }

  // Update transaction
  await adminClient
    .from('email_transactions')
    .update({
      status: 'processed',
      matched_resident_id: params.residentId,
      match_confidence: emailTx.matched_resident_id === params.residentId ? emailTx.match_confidence : 'manual',
      match_method: emailTx.matched_resident_id === params.residentId ? emailTx.match_method : 'manual',
      payment_id: paymentResult.paymentId,
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
      review_notes: params.notes,
      processed_at: new Date().toISOString(),
    })
    .eq('id', transactionId);

  // Handle Save as Alias
  if (params.saveAsAlias && params.residentId) {
    // Use provided aliasName first, fallback to extraction from description
    const senderName = params.aliasName?.trim() ||
      (emailTx.description ? extractSenderName(emailTx.description) : null);

    if (senderName && senderName.length >= 2) {
      // Check if alias already exists
      const { data: existingAlias } = await adminClient
        .from('resident_payment_aliases')
        .select('id')
        .eq('resident_id', params.residentId)
        .ilike('alias_name', senderName)
        .maybeSingle();

      if (!existingAlias) {
        await adminClient.from('resident_payment_aliases').insert({
          resident_id: params.residentId,
          alias_name: senderName,
          notes: params.aliasNotes || `Auto-created from email import match`,
          is_active: true,
          created_by: auth.userId,
        });
      }
    }
  }

  // Audit log
  await logAudit({
    action: 'APPROVE',
    entityType: 'email_transactions',
    entityId: transactionId,
    entityDisplay: `Transaction: ${emailTx.description}`,
    newValues: {
      resident_id: params.residentId,
      payment_id: paymentResult.paymentId,
      notes: params.notes,
      saved_alias: params.saveAsAlias,
    },
  });

  return { success: true, paymentId: paymentResult.paymentId };
}

// ============================================================
// Skip Transaction (Admin Review)
// ============================================================

export async function skipTransaction(
  transactionId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_PROCESS);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const adminClient = await createAdminClient();

  // Get transaction
  const { data: transaction, error: fetchError } = await adminClient
    .from('email_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (fetchError || !transaction) {
    return { success: false, error: 'Transaction not found' };
  }

  const emailTx = transaction as EmailTransaction;

  // Update transaction
  await adminClient
    .from('email_transactions')
    .update({
      status: 'skipped',
      skip_reason: reason,
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', transactionId);

  // Audit log
  await logAudit({
    action: 'REJECT',
    entityType: 'email_transactions',
    entityId: transactionId,
    entityDisplay: `Transaction: ${emailTx.description}`,
    newValues: { skip_reason: reason },
  });

  return { success: true };
}

// ============================================================
// Helper: Create Payment from Transaction
// ============================================================

async function createPaymentFromTransaction(
  transaction: EmailTransaction,
  userId?: string | null
): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  if (!transaction.matched_resident_id || !transaction.amount) {
    return { success: false, error: 'Missing resident or amount' };
  }

  const result = await createPayment({
    resident_id: transaction.matched_resident_id,
    amount: Number(transaction.amount),
    payment_date: transaction.transaction_date
      ? new Date(transaction.transaction_date)
      : new Date(),
    status: 'paid',
    method: 'bank_transfer',
    reference_number: transaction.reference || undefined,
    notes: `Email import: ${transaction.description}`,
    email_import_id: transaction.email_import_id,
    email_transaction_id: transaction.id,
  });

  if (result.error) {
    return { success: false, error: result.error };
  }

  return { success: true, paymentId: result.data?.id };
}

// ============================================================
// Helper: Create Expense from Transaction
// ============================================================

async function createExpenseFromTransaction(
  transaction: EmailTransaction,
  userId?: string | null
): Promise<{ success: boolean; expenseId?: string; error?: string }> {
  if (!transaction.amount) {
    return { success: false, error: 'Missing amount' };
  }

  // Get expense category
  let categoryId = transaction.matched_expense_category_id;

  // Use miscellaneous category if none provided
  if (!categoryId) {
    const adminClient = await createAdminClient();
    const { data: miscCategory } = await adminClient
      .from('expense_categories')
      .select('id')
      .eq('name', 'Bank Import - Miscellaneous')
      .single();

    categoryId = miscCategory?.id || null;
  }

  if (!categoryId) {
    return { success: false, error: 'No expense category found' };
  }

  const result = await createExpense({
    amount: Math.abs(Number(transaction.amount)),
    category_id: categoryId,
    expense_date: transaction.transaction_date || new Date().toISOString().split('T')[0],
    description: transaction.description || 'Email import expense',
    status: 'paid',
    source_type: 'bank_import', // Reusing bank_import source_type for consistent reporting
    payment_method: 'bank_transfer',
    is_verified: true,
    project_id: transaction.matched_project_id || undefined,
  });

  if (!result || !result.id) {
    return { success: false, error: 'Failed to create expense' };
  }

  return { success: true, expenseId: result.id };
}

// ============================================================
// Helper: Check for Duplicate Payment
// ============================================================

async function checkDuplicatePayment(
  residentId: string,
  amount: number,
  date: string,
  reference: string | null,
  toleranceDays: number
): Promise<boolean> {
  const { checkDuplicateGuardrail } = await import('@/lib/matching/duplicate-matcher');
  const result = await checkDuplicateGuardrail({
    amount,
    date,
    residentId,
    reference: reference || undefined
  }, 'payment', { toleranceDays });

  return result.isDuplicate;
}

// ============================================================
// Helper: Check for Duplicate Expense
// ============================================================

async function checkDuplicateExpense(
  amount: number,
  date: string,
  reference: string | null,
  toleranceDays: number
): Promise<boolean> {
  const { checkDuplicateGuardrail } = await import('@/lib/matching/duplicate-matcher');
  const result = await checkDuplicateGuardrail({
    amount,
    date,
    reference: reference || undefined
  }, 'expense', { toleranceDays });

  return result.isDuplicate;
}

// ============================================================
// Get Review Queue
// ============================================================

export async function getReviewQueue(params?: {
  importId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  data: EmailTransaction[] | null;
  count: number | null;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_VIEW);
  if (!auth.authorized) {
    return { data: null, count: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const status = params?.status || 'queued_for_review';

  let query = supabase
    .from('email_transactions')
    .select('*, email_messages(subject, from_address), residents(first_name, last_name, resident_code)', {
      count: 'exact',
    })
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (params?.importId) {
    query = query.eq('email_import_id', params.importId);
  }

  if (params?.limit) {
    query = query.limit(params.limit);
  }

  if (params?.offset) {
    query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
  }

  const { data, count, error } = await query;

  if (error) {
    return { data: null, count: null, error: error.message };
  }

  return { data: data as EmailTransaction[], count, error: null };
}


