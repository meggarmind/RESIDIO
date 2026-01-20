'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createMatcher, type ResidentMatchData } from '@/lib/matching';
import type { BankStatementRow, MatchConfidence, MatchMethod, ResidentPaymentAlias } from '@/types/database';
import { checkDuplicate } from './process-import';

// ============================================================
// Retry Helper with Exponential Backoff
// ============================================================

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

async function fetchWithRetry<T>(
  queryFn: () => Promise<QueryResult<T>>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<QueryResult<T>> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await queryFn();
    if (!result.error) {
      return result;
    }

    console.warn(`Query attempt ${attempt + 1}/${maxRetries} failed:`, result.error.message);

    if (attempt < maxRetries - 1) {
      const delay = baseDelayMs * Math.pow(2, attempt); // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      return result; // Return last error after all retries exhausted
    }
  }

  // This shouldn't be reached but TypeScript needs it
  return { data: null, error: { message: 'Unknown error after retries' } };
}

// ============================================================
// Response Types
// ============================================================

type MatchRowResult = {
  row_id: string;
  resident_id: string | null;
  confidence: MatchConfidence;
  method: MatchMethod | null;
  matched_value?: string;
}

type MatchResidentsResponse = {
  results: MatchRowResult[];
  matched_count: number;
  unmatched_count: number;
  error: string | null;
}

type ManualMatchResponse = {
  data: BankStatementRow | null;
  error: string | null;
}

// ============================================================
// Run Matching Engine on Import Rows
// ============================================================

export async function matchImportRows(import_id: string): Promise<MatchResidentsResponse> {
  const supabase = await createServerSupabaseClient();

  // Get pending rows for this import
  const { data: rows, error: rowsError } = await supabase
    .from('bank_statement_rows')
    .select('*')
    .eq('import_id', import_id)
    .eq('status', 'pending')
    .order('row_number');

  if (rowsError) {
    return {
      results: [],
      matched_count: 0,
      unmatched_count: 0,
      error: rowsError.message,
    };
  }

  if (!rows || rows.length === 0) {
    return {
      results: [],
      matched_count: 0,
      unmatched_count: 0,
      error: null,
    };
  }

  // Load matching data with retry logic for transient network errors
  const [residentsResult, aliasesResult, housesResult] = await Promise.all([
    fetchWithRetry(async () =>
      supabase
        .from('residents')
        .select('id, first_name, last_name, resident_code, phone_primary, email')
        .eq('account_status', 'active')
    ),
    fetchWithRetry(async () =>
      supabase
        .from('resident_payment_aliases')
        .select(`
          *,
          resident:residents(id, first_name, last_name, resident_code)
        `)
        .eq('is_active', true)
    ),
    fetchWithRetry(async () =>
      supabase
        .from('houses')
        .select(`
          id,
          house_number,
          resident_houses(resident_id, is_active)
        `)
        .eq('is_active', true)
    ),
  ]);

  if (residentsResult.error || aliasesResult.error || housesResult.error) {
    // Log actual errors for debugging
    if (residentsResult.error) {
      console.error('Failed to load residents:', residentsResult.error.message);
    }
    if (aliasesResult.error) {
      console.error('Failed to load aliases:', aliasesResult.error.message);
    }
    if (housesResult.error) {
      console.error('Failed to load houses:', housesResult.error.message);
    }

    // Build descriptive error message
    const errors = [
      residentsResult.error ? `residents: ${residentsResult.error.message}` : null,
      aliasesResult.error ? `aliases: ${aliasesResult.error.message}` : null,
      housesResult.error ? `houses: ${housesResult.error.message}` : null,
    ].filter(Boolean);

    return {
      results: [],
      matched_count: 0,
      unmatched_count: 0,
      error: `Failed to load matching data: ${errors.join(', ')}`,
    };
  }

  // Map database fields to matcher interface (phone_primary -> phone)
  const residentsForMatcher = (residentsResult.data || []).map((r: { id: string; first_name: string; last_name: string; resident_code: string; phone_primary?: string | null; email?: string | null }) => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    resident_code: r.resident_code,
    phone: r.phone_primary,
    email: r.email,
  }));

  // Create matcher
  const matcher = createMatcher(
    residentsForMatcher as ResidentMatchData[],
    aliasesResult.data as Array<ResidentPaymentAlias & { resident: ResidentMatchData }>,
    housesResult.data as Array<{ id: string; house_number: string; resident_houses: Array<{ resident_id: string; is_active: boolean }> }>
  );

  // Match each row
  const results: MatchRowResult[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const row of rows) {
    const matchResult = matcher.match({
      description: row.description || '',
      amount: row.amount,
      reference: row.reference,
    });

    // Check for duplicates (cross-referencing payment_records and expenses)
    const dupCheck = await checkDuplicate(
      row.reference,
      row.amount || 0,
      row.transaction_date || '',
      1, // tolerance days
      row.transaction_hash,
      row.description
    );

    const result: MatchRowResult = {
      row_id: row.id,
      resident_id: matchResult.resident_id,
      confidence: matchResult.confidence,
      method: matchResult.method,
      matched_value: matchResult.matched_value,
    };

    results.push(result);

    if (matchResult.resident_id) {
      matchedCount++;
    } else {
      unmatchedCount++;
    }

    // Update row in database
    const isDebit = row.transaction_type === 'debit';
    let status: string;
    let additionalUpdates: Record<string, unknown> = {
      duplicate_reason: dupCheck.is_duplicate ? dupCheck.reason : null,
    };

    if (matchResult.resident_id) {
      // Credit matched to resident
      status = 'matched';
    } else if (isDebit) {
      // For debit transactions, try to auto-match to expense category
      const { autoMatchExpenseCategory } = await import('@/actions/expenses/get-expense-categories');
      const categoryMatch = await autoMatchExpenseCategory(row.description || '');

      if (categoryMatch.category) {
        // Debit matched to expense category
        status = 'matched';
        additionalUpdates = {
          matched_expense_category_id: categoryMatch.category.id,
          match_confidence: 'high',
          match_method: 'keyword',
        };
        // Adjust counts since we found a match for this debit
        unmatchedCount--;
        matchedCount++;
      } else {
        status = 'unmatched';
      }
    } else {
      status = 'unmatched';
    }

    await supabase
      .from('bank_statement_rows')
      .update({
        matched_resident_id: matchResult.resident_id,
        match_confidence: matchResult.confidence,
        match_method: matchResult.method,
        status,
        ...additionalUpdates,
      })
      .eq('id', row.id);
  }

  // Update import matched count
  await supabase
    .from('bank_statement_imports')
    .update({ matched_rows: matchedCount })
    .eq('id', import_id);

  return {
    results,
    matched_count: matchedCount,
    unmatched_count: unmatchedCount,
    error: null,
  };
}

// ============================================================
// Manual Match / Reassign Row
// ============================================================

// ============================================================
// Manual Match / Reassign Row
// ============================================================

type ManualMatchParams = {
  row_id: string;
  resident_id?: string | null;
  project_id?: string | null;
  petty_cash_account_id?: string | null;
  expense_category_id?: string | null;
  save_as_alias?: boolean;
  alias_notes?: string;
}

export async function manualMatchRow(params: ManualMatchParams): Promise<ManualMatchResponse> {
  const supabase = await createServerSupabaseClient();

  const {
    row_id,
    resident_id,
    project_id,
    petty_cash_account_id,
    expense_category_id,
    save_as_alias = false,
    alias_notes
  } = params;

  // Get the row
  const { data: row, error: rowError } = await supabase
    .from('bank_statement_rows')
    .select('*')
    .eq('id', row_id)
    .single();

  if (rowError || !row) {
    return {
      data: null,
      error: 'Row not found',
    };
  }

  // Verify resident exists if provided
  if (resident_id) {
    const { data: resident, error: residentError } = await supabase
      .from('residents')
      .select('id, first_name, last_name')
      .eq('id', resident_id)
      .single();

    if (residentError || !resident) {
      return {
        data: null,
        error: 'Resident not found',
      };
    }
  }

  // Determine assignment values (ensure mutual exclusivity)
  const updateData: any = {
    match_confidence: 'manual',
    match_method: 'manual',
    status: 'matched',
  };

  if (resident_id) {
    updateData.matched_resident_id = resident_id;
    updateData.matched_project_id = null;
    updateData.matched_petty_cash_account_id = null;
    updateData.matched_expense_category_id = null;
  } else if (project_id) {
    updateData.matched_resident_id = null;
    updateData.matched_project_id = project_id;
    updateData.matched_petty_cash_account_id = null;
    updateData.matched_expense_category_id = null;
  } else if (petty_cash_account_id) {
    updateData.matched_resident_id = null;
    updateData.matched_project_id = null;
    updateData.matched_petty_cash_account_id = petty_cash_account_id;
    updateData.matched_expense_category_id = null;
  } else if (expense_category_id) {
    updateData.matched_resident_id = null;
    updateData.matched_project_id = null;
    updateData.matched_petty_cash_account_id = null;
    updateData.matched_expense_category_id = expense_category_id;
  } else {
    return {
      data: null,
      error: 'No assignment target provided',
    };
  }

  // Update row with manual match
  const { data: updatedRow, error: updateError } = await supabase
    .from('bank_statement_rows')
    .update(updateData)
    .eq('id', row_id)
    .select()
    .single();

  if (updateError) {
    return {
      data: null,
      error: updateError.message,
    };
  }

  // Optionally save as alias (only for residents)
  if (resident_id && save_as_alias && row.description) {
    // Extract sender name from description
    const senderName = extractSenderName(row.description);
    if (senderName) {
      const { data: { user } } = await supabase.auth.getUser();

      // Check if alias already exists
      const { data: existingAlias } = await supabase
        .from('resident_payment_aliases')
        .select('id')
        .eq('resident_id', resident_id)
        .ilike('alias_name', senderName)
        .single();

      if (!existingAlias) {
        await supabase.from('resident_payment_aliases').insert({
          resident_id,
          alias_name: senderName,
          notes: alias_notes || `Auto-created from import match`,
          is_active: true,
          created_by: user?.id,
        });
      }
    }
  }

  return {
    data: updatedRow as BankStatementRow,
    error: null,
  };
}

/**
 * Extract potential sender name from bank description
 */
function extractSenderName(description: string): string | null {
  // Remove common banking prefixes
  let cleaned = description
    .replace(/^(NIP\/|WTRNS\/|WEB\/|MOBILE\/|USSD\/)/i, '')
    .replace(/transfer (from|to)/gi, '')
    .trim();

  // Try to find a capitalized name pattern
  const nameMatch = cleaned.match(/([A-Z][a-z]+ ){1,3}[A-Z][a-z]+/);
  if (nameMatch) {
    return nameMatch[0].trim();
  }

  // Take first 3-4 words if they look like names
  const words = cleaned.split(/\s+/).filter((w) => w.length > 1);
  const potentialName = words.slice(0, 4).join(' ');

  // Only return if it looks like a name (has at least 2 alphabetic words)
  const alphaWords = potentialName.split(/\s+/).filter((w) => /^[a-zA-Z]+$/.test(w));
  if (alphaWords.length >= 2) {
    return alphaWords.join(' ');
  }

  return null;
}

// ============================================================
// Unmatch Row (Clear Match)
// ============================================================

export async function unmatchRow(row_id: string): Promise<ManualMatchResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('bank_statement_rows')
    .update({
      matched_resident_id: null,
      matched_project_id: null,
      matched_petty_cash_account_id: null,
      matched_expense_category_id: null,
      match_confidence: 'none',
      match_method: null,
      status: 'unmatched',
    })
    .eq('id', row_id)
    .select()
    .single();

  if (error) {
    return {
      data: null,
      error: error.message,
    };
  }

  return {
    data: data as BankStatementRow,
    error: null,
  };
}

// ============================================================
// Mark Row as Skip
// ============================================================

export async function skipRow(row_id: string): Promise<ManualMatchResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('bank_statement_rows')
    .update({ status: 'skipped' })
    .eq('id', row_id)
    .select()
    .single();

  if (error) {
    return {
      data: null,
      error: error.message,
    };
  }

  return {
    data: data as BankStatementRow,
    error: null,
  };
}

// ============================================================
// Batch Update Row Status
// ============================================================

type BatchUpdateParams = {
  row_ids: string[];
  status: BankStatementRow['status'];
}

export async function batchUpdateRowStatus(params: BatchUpdateParams): Promise<{ count: number; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { row_ids, status } = params;

  const { error, count } = await supabase
    .from('bank_statement_rows')
    .update({ status })
    .in('id', row_ids);

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: count ?? row_ids.length, error: null };
}
