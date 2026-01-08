'use server';

/**
 * Email Import Processing Actions
 *
 * Matches email transactions to residents and processes them into payments.
 * Implements high-confidence auto-processing and admin review queue.
 */

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createMatcher } from '@/lib/matching/resident-matcher';
import { createPayment } from '@/actions/payments/create-payment';
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
    if (emailTx.transaction_type !== 'credit') {
      // Skip debits - they're not payments
      await adminClient
        .from('email_transactions')
        .update({
          status: 'skipped',
          skip_reason: 'Debit transaction (not a payment)',
        })
        .eq('id', emailTx.id);
      continue;
    }

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
      error: auth.error || 'Unauthorized',
    };
  }

  const adminClient = await createAdminClient();

  // Get matched transactions for this import
  const { data: transactions, error: fetchError } = await adminClient
    .from('email_transactions')
    .select('*')
    .eq('email_import_id', importId)
    .eq('status', 'matched');

  if (fetchError || !transactions) {
    return {
      success: false,
      autoProcessed: 0,
      queuedForReview: 0,
      skipped: 0,
      errored: 0,
      error: fetchError?.message || 'Failed to fetch transactions',
    };
  }

  const result: ProcessEmailTransactionsResult = {
    success: true,
    autoProcessed: 0,
    queuedForReview: 0,
    skipped: 0,
    errored: 0,
  };

  for (const tx of transactions) {
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
      // Queue for admin review
      await adminClient
        .from('email_transactions')
        .update({ status: 'queued_for_review' })
        .eq('id', emailTx.id);

      result.queuedForReview++;
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

  return result;
}

// ============================================================
// Process Single Transaction (Admin Review)
// ============================================================

export async function processSingleTransaction(
  transactionId: string,
  params: {
    residentId: string;
    notes?: string;
  }
): Promise<{ success: boolean; paymentId?: string; error?: string }> {
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
  if (!['queued_for_review', 'matched', 'pending'].includes(emailTx.status)) {
    return { success: false, error: `Cannot process transaction with status: ${emailTx.status}` };
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
// Helper: Check for Duplicate Payment
// ============================================================

async function checkDuplicatePayment(
  residentId: string,
  amount: number,
  date: string,
  reference: string | null,
  toleranceDays: number
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  // Check by reference first
  if (reference) {
    const { data: byRef } = await supabase
      .from('payment_records')
      .select('id')
      .eq('reference_number', reference)
      .single();

    if (byRef) return true;
  }

  // Check by amount + resident + date within tolerance
  const paymentDate = new Date(date);
  const startDate = new Date(paymentDate);
  startDate.setDate(startDate.getDate() - toleranceDays);
  const endDate = new Date(paymentDate);
  endDate.setDate(endDate.getDate() + toleranceDays);

  const { data: byAmountDate } = await supabase
    .from('payment_records')
    .select('id')
    .eq('resident_id', residentId)
    .eq('amount', amount)
    .gte('payment_date', startDate.toISOString().split('T')[0])
    .lte('payment_date', endDate.toISOString().split('T')[0])
    .limit(1);

  return (byAmountDate?.length || 0) > 0;
}

// ============================================================
// Get Review Queue
// ============================================================

export async function getReviewQueue(params?: {
  importId?: string;
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

  let query = supabase
    .from('email_transactions')
    .select('*, email_messages(subject, from_address), residents(first_name, last_name, resident_code)', {
      count: 'exact',
    })
    .eq('status', 'queued_for_review')
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
