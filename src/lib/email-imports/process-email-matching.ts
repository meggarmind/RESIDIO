/**
 * Email transaction matching (service-role library, NOT a server action)
 *
 * Deliberately has no server-action directive and no auth: it uses the service-role
 * client and is only called by the CRON_SECRET cron route, fetch-emails and guarded
 * actions. Exporting it from a server-action file would make it a public endpoint (#561).
 */

import { createAdminClient } from '@/lib/supabase/server';
import { createMatcher } from '@/lib/matching/resident-matcher';
import { updateEmailImportStatus } from '@/actions/email-imports/create-email-import';
import type { EmailTransaction } from '@/types/database';

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
