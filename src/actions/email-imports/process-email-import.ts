'use server';

/**
 * Email Import Processing Actions
 *
 * Matches email transactions to residents and processes them into payments.
 * Implements high-confidence auto-processing and admin review queue.
 */
import { DEFAULT_CHARGE_CATEGORY } from '@/lib/billing/charge-categories';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createPayment } from '@/actions/payments/create-payment';
import { createPaymentCore } from '@/lib/payments/create-payment';
import { embed } from '@/lib/utils';
import { exceedsEmailAutoProcessLimit, extractSenderName } from '@/lib/email-imports/utils';
// The limit (#710) and match rule are shared with the scheduled auto-record step (#1340).
// So is the source gate: alert only, estate account, sender checked (#1353).
import {
  checkAutoRecordGate,
  isAutoProcessMatch,
  readEmailAutoProcessLimit,
  readEstateAccountNumbers,
} from '@/lib/email-imports/auto-record';
import { createExpense } from '@/actions/expenses/create-expense';
import { z } from 'zod';
import { reversePaymentSettlement } from '@/lib/payments/reverse-payment-settlement';
import { writeEmailImportStatus } from '@/lib/email-imports/import-records';
import type {
  EmailTransaction,
  ProcessEmailTransactionsOptions,
  ProcessEmailTransactionsResult,
} from '@/types/database';

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
    .select('*, email_messages(email_type, sender_verified, sender_check)')
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

  // Read once per run, not per transaction.
  const autoProcessLimit = await readEmailAutoProcessLimit();
  const estate = await readEstateAccountNumbers(adminClient);
  if (estate.error !== null) {
    return {
      success: false,
      autoProcessed: 0,
      queuedForReview: 0,
      skipped: 0,
      errored: 0,
      expensesCreated: 0,
      error: estate.error,
    };
  }

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
    const canAutoProcess = autoProcessHighConfidence && isAutoProcessMatch(emailTx);

    if (canAutoProcess && exceedsEmailAutoProcessLimit(emailTx, autoProcessLimit)) {
      // Over the limit: wait for an approver (#709). The review queue shows
      // the reason from the amount, so no column records it.
      await adminClient
        .from('email_transactions')
        .update({ status: 'queued_for_review' })
        .eq('id', emailTx.id);
      result.queuedForReview++;
      continue;
    }

    const gate = canAutoProcess
      ? checkAutoRecordGate(tx, estate.accounts)
      : null;
    if (gate) {
      // Same gate as the scheduled auto-record step: a statement row, another account or an
      // unchecked sender waits for an admin.
      await adminClient
        .from('email_transactions')
        .update({ status: 'queued_for_review', review_reason: gate.reviewReason })
        .eq('id', emailTx.id);
      result.queuedForReview++;
      continue;
    }

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
  await writeEmailImportStatus(adminClient, {
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

/** One part of an alert and what it is for (#1443). */
export type PaymentLine = { chargeCategory: string; amount: number; comment?: string };

const paymentLinesSchema = z.array(
  z.object({
    chargeCategory: z.string(),
    amount: z.number(),
    comment: z.string().nullish(),
  })
);

const OTHER_CATEGORY = 'other';
const MAX_COMMENT_LENGTH = 500;
const toKobo = (naira: number) => Math.round(naira * 100);

/**
 * Check the lines of an alert before anything is written (#1443). Returns a plain message
 * when they cannot be recorded, null when they can.
 */
function validateLines(
  lines: PaymentLine[],
  alertAmount: number,
  activeCodes: Set<string>
): string | null {
  if (lines.length < 1) return 'Add at least one line';
  let total = 0;
  for (const line of lines) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) return 'Each line needs an amount above zero';
    if (Math.abs(line.amount * 100 - toKobo(line.amount)) > 1e-6) {
      return 'A line amount can have at most 2 decimal places';
    }
    if (!activeCodes.has(line.chargeCategory)) {
      return `Unknown or inactive charge category: ${line.chargeCategory}`;
    }
    if (line.chargeCategory === OTHER_CATEGORY) {
      const comment = line.comment?.trim() ?? '';
      if (comment.length < 1 || comment.length > MAX_COMMENT_LENGTH) {
        return `A line for Other needs a comment of 1 to ${MAX_COMMENT_LENGTH} characters`;
      }
    }
    total += toKobo(line.amount);
  }
  if (total !== toKobo(alertAmount)) {
    return 'The lines must add up to the amount of the alert';
  }
  return null;
}

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
    /** Credit only (#1443). Left out: one Dues payment for the whole amount. */
    lines?: PaymentLine[];
  }
): Promise<{ success: boolean; paymentId?: string; expenseId?: string; error?: string }> {
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_PROCESS);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const adminClient = await createAdminClient();

  // Get transaction, with the sender check of its email (#1353)
  const { data: transaction, error: fetchError } = await adminClient
    .from('email_transactions')
    .select('*, email_messages(sender_verified)')
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
  const canApproveOverLimit =
    auth.permissions.includes(PERMISSIONS.IMPORTS_APPROVE) || auth.roleName === 'super_admin';
  if (!canApproveOverLimit) {
    const limit = await readEmailAutoProcessLimit();
    if (exceedsEmailAutoProcessLimit(emailTx, limit)) {
      const over = limit === null
        ? 'the approval limit could not be read, so payments'
        : `payments over ₦${limit.toLocaleString('en-NG')}`;
      return {
        success: false,
        error: `Needs approval: ${over} require the '${PERMISSIONS.IMPORTS_APPROVE}' permission or super admin`,
      };
    }
  }

  if (!params.residentId) {
    return { success: false, error: 'Resident ID required for payment transactions' };
  }

  if (params.lines !== undefined) {
    const parsedLines = paymentLinesSchema.safeParse(params.lines);
    if (!parsedLines.success) return { success: false, error: 'The lines are not valid' };
    const { data: categories, error: categoriesError } = await adminClient
      .from('charge_categories')
      .select('code')
      .eq('is_active', true);
    if (categoriesError) {
      return { success: false, error: `Could not read the charge categories: ${categoriesError.message}` };
    }
    const lineError = validateLines(
      parsedLines.data.map((l) => ({ ...l, comment: l.comment ?? undefined })),
      Number(emailTx.amount),
      new Set((categories ?? []).map((c: { code: string }) => c.code))
    );
    if (lineError) return { success: false, error: lineError };
  }

  // An alert whose email passed the sender check is bank proof (owner decision, 2 Nov 2026, #1428).
  // Recording it verified also needs payments.verify, so payments.create alone cannot self-verify.
  const senderVerified = embed(transaction.email_messages)?.sender_verified === true;
  const verified = senderVerified && auth.permissions.includes(PERMISSIONS.PAYMENTS_VERIFY);

  // Create payment
  const paymentResult = await createPaymentFromTransaction(
    {
      ...emailTx,
      matched_resident_id: params.residentId,
    },
    auth.userId,
    verified,
    params.lines
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
      payment_id: paymentResult.paymentIds?.[0],
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
      payment_ids: paymentResult.paymentIds,
      lines: params.lines?.map((l) => ({
        charge_category: l.chargeCategory,
        amount: l.amount,
        comment: l.comment?.trim() || undefined,
      })),
      notes: params.notes,
      saved_alias: params.saveAsAlias,
      verified,
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
  userId?: string | null,
  verified = false,
  lines?: PaymentLine[]
): Promise<{ success: boolean; paymentId?: string; paymentIds?: string[]; error?: string }> {
  if (!transaction.matched_resident_id || !transaction.amount) {
    return { success: false, error: 'Missing resident or amount' };
  }

  // The public action records the payment unverified; the core records it verified (#1428).
  const create = verified
    ? (data: Parameters<typeof createPayment>[0]) => createPaymentCore({ ...data, is_verified: true }, { trustedVerification: true })
    : createPayment;

  // No lines: one Dues payment for the whole amount. The sender was matched to this resident,
  // so they paid it; no purpose is known: Dues (#1190).
  const parts: PaymentLine[] = lines ?? [
    { chargeCategory: DEFAULT_CHARGE_CATEGORY, amount: Number(transaction.amount) },
  ];
  // Two or more lines share one group, so the duplicate guard knows they are one alert (#1443).
  const groupId = parts.length > 1 ? crypto.randomUUID() : undefined;

  const paymentIds: string[] = [];
  for (const part of parts) {
    const comment = part.comment?.trim();
    const result = await create({
      resident_id: transaction.matched_resident_id,
      amount: part.amount,
      payment_date: transaction.transaction_date
        ? new Date(transaction.transaction_date)
        : new Date(),
      status: 'paid',
      method: 'bank_transfer',
      reference_number: transaction.reference || undefined,
      notes: `Email import: ${transaction.description}${comment ? ` · ${comment}` : ''}`,
      email_import_id: transaction.email_import_id,
      email_transaction_id: transaction.id,
      charge_category: part.chargeCategory,
      paid_by_resident_id: transaction.matched_resident_id,
      ...(groupId ? { split_payment_group_id: groupId } : {}),
    });

    if (result.error || !result.data?.id) {
      const rollbackError = await rollbackPayments(paymentIds, userId);
      const reason = result.error || 'Payment was not recorded';
      return {
        success: false,
        error: rollbackError ? `${reason}. Earlier lines could not be undone: ${rollbackError}` : reason,
      };
    }
    paymentIds.push(result.data.id);
  }

  return { success: true, paymentId: paymentIds[0], paymentIds };
}

/** Undo the lines already recorded when a later line fails (#1443); mirrors deletePayment. */
async function rollbackPayments(paymentIds: string[], userId?: string | null): Promise<string | null> {
  if (paymentIds.length === 0) return null;
  const adminClient = await createAdminClient();
  const failures: string[] = [];
  for (const id of paymentIds) {
    const { data: existing } = await adminClient.from('payment_records').select('*').eq('id', id).single();
    if (!existing) {
      failures.push(`payment ${id} not found`);
      continue;
    }
    const reversalError = await reversePaymentSettlement(
      adminClient as unknown as Parameters<typeof reversePaymentSettlement>[0],
      existing,
      userId
    );
    if (reversalError) {
      failures.push(reversalError);
      continue;
    }
    const { error } = await adminClient.from('payment_records').delete().eq('id', id);
    if (error) {
      failures.push(error.message);
      continue;
    }
    // The "payment received" WhatsApp for this row must not go out for a payment that no longer exists.
    // Only a row still waiting is cancelled; one already sent or being sent stays.
    const { error: queueError } = await adminClient
      .from('notification_queue')
      .update({ status: 'cancelled', error_message: 'Payment undone: a later line of the same alert failed' })
      .eq('deduplication_key', `payment_received:${id}`)
      .eq('status', 'pending');
    if (queueError) failures.push(`receipt message for payment ${id} not cancelled: ${queueError.message}`);
    await logAudit({
      action: 'DELETE',
      entityType: 'payments',
      entityId: id,
      entityDisplay: `Payment ₦${Number(existing.amount).toLocaleString()}${existing.reference_number ? ` (${existing.reference_number})` : ''} (undone: a later line of the same alert failed)`,
      oldValues: existing,
    });
  }
  return failures.length ? failures.join('; ') : null;
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

  // Record a rejected expense (e.g. a zero or 3-decimal amount) as a failed row
  // instead of aborting the whole import.
  let result: Awaited<ReturnType<typeof createExpense>>;
  try {
    result = await createExpense({
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
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create expense',
    };
  }

  if (result.error || !result.data?.id) {
    return { success: false, error: result.error || 'Failed to create expense' };
  }

  return { success: true, expenseId: result.data.id };
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
  /** The current auto-process limit; null when it could not be read (#710). */
  autoProcessLimit: number | null;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_VIEW);
  if (!auth.authorized) {
    return { data: null, count: null, autoProcessLimit: null, error: auth.error || 'Unauthorized' };
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

  const [{ data, count, error }, autoProcessLimit] = await Promise.all([
    query,
    readEmailAutoProcessLimit(),
  ]);

  if (error) {
    return { data: null, count: null, autoProcessLimit, error: error.message };
  }

  return { data: data as EmailTransaction[], count, autoProcessLimit, error: null };
}


