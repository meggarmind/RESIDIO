'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { BankStatementImport, BankStatementRow, ImportStatus } from '@/types/database';

// ============================================================
// Response Types
// ============================================================

export interface BankStatementImportWithDetails extends BankStatementImport {
  bank_account?: {
    id: string;
    account_number: string;
    account_name: string;
    bank_name: string;
  };
  created_by_user?: {
    id: string;
    full_name: string;
    email: string;
  };
  approved_by_user?: {
    id: string;
    full_name: string;
    email: string;
  };
}

export interface BankStatementRowWithResident extends BankStatementRow {
  resident?: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
  };
  payment?: {
    id: string;
    amount: number;
    status: string;
  };
}

export interface GetImportsResponse {
  data: BankStatementImportWithDetails[];
  count: number;
  error: string | null;
}

export interface GetImportResponse {
  data: BankStatementImportWithDetails | null;
  error: string | null;
}

export interface GetImportRowsResponse {
  data: BankStatementRowWithResident[];
  count: number;
  error: string | null;
}

// ============================================================
// Search Params
// ============================================================

export interface ImportSearchParams {
  status?: ImportStatus;
  bank_account_id?: string;
  created_by?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

export interface ImportRowSearchParams {
  status?: BankStatementRow['status'];
  has_match?: boolean;
  page?: number;
  limit?: number;
}

// ============================================================
// Get All Imports
// ============================================================

export async function getImports(params: ImportSearchParams = {}): Promise<GetImportsResponse> {
  const supabase = await createServerSupabaseClient();

  const { status, bank_account_id, created_by, start_date, end_date, page = 1, limit = 20 } = params;

  let query = supabase
    .from('bank_statement_imports')
    .select(`
      *,
      bank_account:estate_bank_accounts(id, account_number, account_name, bank_name),
      created_by_user:profiles!bank_statement_imports_created_by_fkey(id, full_name, email),
      approved_by_user:profiles!bank_statement_imports_approved_by_fkey(id, full_name, email)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (bank_account_id) {
    query = query.eq('bank_account_id', bank_account_id);
  }

  if (created_by) {
    query = query.eq('created_by', created_by);
  }

  if (start_date) {
    query = query.gte('created_at', start_date);
  }

  if (end_date) {
    query = query.lte('created_at', end_date);
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  return {
    data: (data as BankStatementImportWithDetails[]) ?? [],
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

// ============================================================
// Get Single Import
// ============================================================

export async function getImport(id: string): Promise<GetImportResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('bank_statement_imports')
    .select(`
      *,
      bank_account:estate_bank_accounts(id, account_number, account_name, bank_name),
      created_by_user:profiles!bank_statement_imports_created_by_fkey(id, full_name, email),
      approved_by_user:profiles!bank_statement_imports_approved_by_fkey(id, full_name, email)
    `)
    .eq('id', id)
    .single();

  return {
    data: data as BankStatementImportWithDetails | null,
    error: error?.message ?? null,
  };
}

// ============================================================
// Get Import Rows
// ============================================================

export async function getImportRows(
  import_id: string,
  params: ImportRowSearchParams = {}
): Promise<GetImportRowsResponse> {
  const supabase = await createServerSupabaseClient();

  const { status, has_match, page = 1, limit = 50 } = params;

  let query = supabase
    .from('bank_statement_rows')
    .select(`
      *,
      resident:residents(id, first_name, last_name, resident_code),
      payment:payment_records!payment_id(id, amount, status)
    `, { count: 'exact' })
    .eq('import_id', import_id)
    .order('row_number');

  if (status) {
    query = query.eq('status', status);
  }

  if (has_match === true) {
    query = query.not('matched_resident_id', 'is', null);
  } else if (has_match === false) {
    query = query.is('matched_resident_id', null);
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  return {
    data: (data as BankStatementRowWithResident[]) ?? [],
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

// ============================================================
// Get Import Stats
// ============================================================

export interface ImportStats {
  total_imports: number;
  pending_imports: number;
  awaiting_approval: number;
  completed_imports: number;
  total_payments_created: number;
  total_amount_imported: number;
}

export async function getImportStats(): Promise<{ data: ImportStats | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get import counts by status
  const { data: imports, error: importsError } = await supabase
    .from('bank_statement_imports')
    .select('status, created_rows');

  if (importsError) {
    return { data: null, error: importsError.message };
  }

  const stats: ImportStats = {
    total_imports: imports.length,
    pending_imports: imports.filter((i) => i.status === 'pending' || i.status === 'processing').length,
    awaiting_approval: imports.filter((i) => i.status === 'awaiting_approval').length,
    completed_imports: imports.filter((i) => i.status === 'completed').length,
    total_payments_created: imports.reduce((sum, i) => sum + (i.created_rows || 0), 0),
    total_amount_imported: 0, // Would need to aggregate from rows
  };

  // Get total amount from created payments
  const { data: payments } = await supabase
    .from('payment_records')
    .select('amount')
    .not('import_id', 'is', null);

  if (payments) {
    stats.total_amount_imported = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }

  return { data: stats, error: null };
}

// ============================================================
// Get Import Row Summary
// ============================================================

export interface ImportRowSummary {
  total: number;
  matched: number;
  unmatched: number;
  created: number;
  skipped: number;
  duplicate: number;
  error: number;
  pending: number;
}

export async function getImportRowSummary(import_id: string): Promise<{ data: ImportRowSummary | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: rows, error } = await supabase
    .from('bank_statement_rows')
    .select('status')
    .eq('import_id', import_id);

  if (error) {
    return { data: null, error: error.message };
  }

  const summary: ImportRowSummary = {
    total: rows.length,
    matched: rows.filter((r) => r.status === 'matched').length,
    unmatched: rows.filter((r) => r.status === 'unmatched').length,
    created: rows.filter((r) => r.status === 'created').length,
    skipped: rows.filter((r) => r.status === 'skipped').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    error: rows.filter((r) => r.status === 'error').length,
    pending: rows.filter((r) => r.status === 'pending').length,
  };

  return { data: summary, error: null };
}

// ============================================================
// Get Pending Approval Imports
// ============================================================

export async function getPendingApprovalImports(): Promise<GetImportsResponse> {
  return getImports({ status: 'awaiting_approval' });
}

// ============================================================
// Get Import Breakdown by Transaction Type and Tag
// ============================================================

export interface TagBreakdownItem {
  tag_id: string | null;
  tag_name: string;
  tag_color: string;
  count: number;
  total: number;
}

export interface TransactionTypeBreakdown {
  count: number;
  total: number;
  byTag: TagBreakdownItem[];
}

export interface ImportBreakdown {
  credits: TransactionTypeBreakdown;
  debits: TransactionTypeBreakdown;
  untagged: {
    credits: { count: number; total: number };
    debits: { count: number; total: number };
  };
  netFlow: number;
}

export async function getImportBreakdown(
  import_id: string
): Promise<{ data: ImportBreakdown | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get all rows with their tags
  const { data: rows, error: rowsError } = await supabase
    .from('bank_statement_rows')
    .select(`
      id,
      amount,
      transaction_type,
      tag_id,
      tag:transaction_tags(id, name, color)
    `)
    .eq('import_id', import_id)
    .not('status', 'eq', 'skipped');

  if (rowsError) {
    return { data: null, error: rowsError.message };
  }

  // Initialize breakdown
  const breakdown: ImportBreakdown = {
    credits: { count: 0, total: 0, byTag: [] },
    debits: { count: 0, total: 0, byTag: [] },
    untagged: {
      credits: { count: 0, total: 0 },
      debits: { count: 0, total: 0 },
    },
    netFlow: 0,
  };

  // Aggregate by tag
  const creditTagMap = new Map<string, TagBreakdownItem>();
  const debitTagMap = new Map<string, TagBreakdownItem>();

  for (const row of rows || []) {
    const amount = row.amount || 0;
    // Supabase returns single object for many-to-one relationships, but TypeScript infers array
    const tagData = row.tag;
    const tag = (Array.isArray(tagData) ? tagData[0] : tagData) as { id: string; name: string; color: string } | null;

    if (row.transaction_type === 'credit') {
      breakdown.credits.count++;
      breakdown.credits.total += amount;
      breakdown.netFlow += amount;

      if (tag) {
        const existing = creditTagMap.get(tag.id);
        if (existing) {
          existing.count++;
          existing.total += amount;
        } else {
          creditTagMap.set(tag.id, {
            tag_id: tag.id,
            tag_name: tag.name,
            tag_color: tag.color,
            count: 1,
            total: amount,
          });
        }
      } else {
        breakdown.untagged.credits.count++;
        breakdown.untagged.credits.total += amount;
      }
    } else if (row.transaction_type === 'debit') {
      breakdown.debits.count++;
      breakdown.debits.total += amount;
      breakdown.netFlow -= amount;

      if (tag) {
        const existing = debitTagMap.get(tag.id);
        if (existing) {
          existing.count++;
          existing.total += amount;
        } else {
          debitTagMap.set(tag.id, {
            tag_id: tag.id,
            tag_name: tag.name,
            tag_color: tag.color,
            count: 1,
            total: amount,
          });
        }
      } else {
        breakdown.untagged.debits.count++;
        breakdown.untagged.debits.total += amount;
      }
    }
  }

  // Convert maps to arrays, sorted by total descending
  breakdown.credits.byTag = Array.from(creditTagMap.values()).sort(
    (a, b) => b.total - a.total
  );
  breakdown.debits.byTag = Array.from(debitTagMap.values()).sort(
    (a, b) => b.total - a.total
  );

  return { data: breakdown, error: null };
}
