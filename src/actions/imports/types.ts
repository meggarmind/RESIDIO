/**
 * Import Module Types
 *
 * Shared types for the import actions module.
 * These are kept separate from 'use server' files because
 * Next.js 15/16 doesn't allow exporting non-functions from 'use server' files.
 */

import type {
  EstateBankAccount,
  BankStatementImport,
  BankStatementRow,
  ImportStatus,
  ResidentPaymentAlias,
  ColumnMapping,
} from '@/types/database';

// ============================================================
// Bank Account Types
// ============================================================

export type GetBankAccountsResponse = {
  data: EstateBankAccount[];
  error: string | null;
};

export type GetBankAccountResponse = {
  data: EstateBankAccount | null;
  error: string | null;
};

export type MutateBankAccountResponse = {
  data: EstateBankAccount | null;
  error: string | null;
  requiresApproval?: boolean;
  approvalRequestId?: string;
};

export type DeleteBankAccountResponse = {
  error: string | null;
  requiresApproval?: boolean;
  approvalRequestId?: string;
};

// ============================================================
// Import Types
// ============================================================

export type BankStatementImportWithDetails = BankStatementImport & {
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
};

export type BankStatementRowWithResident = BankStatementRow & {
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
};

export type GetImportsResponse = {
  data: BankStatementImportWithDetails[];
  count: number;
  error: string | null;
};

export type GetImportResponse = {
  data: BankStatementImportWithDetails | null;
  error: string | null;
};

export type GetImportRowsResponse = {
  data: BankStatementRowWithResident[];
  count: number;
  error: string | null;
};

export type ImportSearchParams = {
  status?: ImportStatus;
  bank_account_id?: string;
  created_by?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
};

export type ImportRowSearchParams = {
  status?: BankStatementRow['status'];
  has_match?: boolean;
  page?: number;
  limit?: number;
};

export type ImportStats = {
  total_imports: number;
  pending_imports: number;
  awaiting_approval: number;
  completed_imports: number;
  total_payments_created: number;
  total_amount_imported: number;
};

export type ImportRowSummary = {
  total: number;
  matched: number;
  unmatched: number;
  created: number;
  skipped: number;
  duplicate: number;
  error: number;
  pending: number;
};

export type TagBreakdownItem = {
  tag_id: string | null;
  tag_name: string;
  tag_color: string;
  count: number;
  total: number;
};

export type TransactionTypeBreakdown = {
  count: number;
  total: number;
  byTag: TagBreakdownItem[];
};

export type ImportBreakdown = {
  credits: TransactionTypeBreakdown;
  debits: TransactionTypeBreakdown;
  untagged: {
    credits: { count: number; total: number };
    debits: { count: number; total: number };
  };
  netFlow: number;
};

// ============================================================
// Create Import Types
// ============================================================

export type CreateImportParams = {
  file_name: string;
  file_type: 'csv' | 'xlsx';
  bank_account_id: string;
  bank_name?: string;
  transaction_filter?: 'credit' | 'debit' | 'all';
  total_rows: number;
  column_mapping: ColumnMapping;
  file_hash?: string;
  period_start?: string;
  period_end?: string;
};

export type CreateImportResponse = {
  data: BankStatementImport | null;
  error: string | null;
};

// Note: CreateImportRowsParams uses ParsedRow from @/lib/validators/import
// which has nullable fields - the server action transforms them before DB insert
export type CreateImportRowsParams = {
  import_id: string;
  rows: Array<{
    row_number: number;
    raw_data: Record<string, unknown>;
    transaction_date: Date | null;
    description: string | null;
    amount: number | null;
    transaction_type: 'credit' | 'debit' | null;
    reference: string | null;
  }>;
};

export type CreateImportRowsResponse = {
  count: number;
  error: string | null;
};

export type UpdateImportStatusParams = {
  import_id: string;
  status: ImportStatus;
  total_rows?: number;
  matched_rows?: number;
  error_message?: string;
};

// ============================================================
// Match Residents Types
// ============================================================

export type MatchRowResult = {
  row_id: string;
  matched: boolean;
  resident_id?: string;
  resident_name?: string;
  confidence?: 'exact_code' | 'exact_alias' | 'exact_name' | 'partial_name';
  match_source?: string;
};

export type MatchResidentsResponse = {
  data: MatchRowResult[] | null;
  matched_count: number;
  error: string | null;
};

export type ManualMatchParams = {
  row_id: string;
  resident_id: string;
  save_as_alias?: boolean;
  alias_notes?: string;
};

export type ManualMatchResponse = {
  success: boolean;
  error: string | null;
};

export type BatchUpdateParams = {
  row_ids: string[];
  status: BankStatementRow['status'];
};

// ============================================================
// Process Import Types
// ============================================================

export type ProcessImportOptions = {
  import_id: string;
  /** atomic: all-or-nothing, individual: process each row independently */
  mode?: 'atomic' | 'individual';
  /** Skip rows flagged as duplicates */
  skip_duplicates?: boolean;
  /** Skip unmatched rows */
  skip_unmatched?: boolean;
  /** Days tolerance for duplicate detection */
  duplicate_tolerance_days?: number;
};

export type ProcessImportResult = {
  success: boolean;
  created_count: number;
  created_payments_count: number;
  created_expenses_count: number;
  skipped_count: number;
  error_count: number;
  errors: Array<{ row_id: string; error: string }>;
  import_id: string;
};


export type DuplicateCheckResult = {
  is_duplicate: boolean;
  existing_payment_id?: string;
  match_fields?: string[];
  reason?: string;
  is_fuzzy?: boolean;
  existing_status?: 'pending' | 'paid' | 'cancelled';
  is_expense?: boolean;
};


// ============================================================
// Aliases Types
// ============================================================

export type ResidentPaymentAliasWithResident = ResidentPaymentAlias & {
  resident?: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
  };
};

export type GetAliasesResponse = {
  data: ResidentPaymentAlias[];
  error: string | null;
};

export type GetAliasResponse = {
  data: ResidentPaymentAlias | null;
  error: string | null;
};

export type MutateAliasResponse = {
  data: ResidentPaymentAlias | null;
  error: string | null;
};

export type GetAliasesWithResidentResponse = {
  data: ResidentPaymentAliasWithResident[];
  error: string | null;
};
