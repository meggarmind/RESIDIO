/**
 * Import Actions Index
 *
 * Central export for all bank statement import actions.
 */

// Re-export all types from the types file (not from 'use server' files)
export type {
  // Bank Account Types
  GetBankAccountsResponse,
  GetBankAccountResponse,
  MutateBankAccountResponse,
  DeleteBankAccountResponse,
  // Import Types
  BankStatementImportWithDetails,
  BankStatementRowWithResident,
  GetImportsResponse,
  GetImportResponse,
  GetImportRowsResponse,
  ImportSearchParams,
  ImportRowSearchParams,
  ImportStats,
  ImportRowSummary,
  TagBreakdownItem,
  TransactionTypeBreakdown,
  ImportBreakdown,
  // Create Import Types
  CreateImportParams,
  CreateImportResponse,
  CreateImportRowsParams,
  CreateImportRowsResponse,
  UpdateImportStatusParams,
  // Match Residents Types
  MatchRowResult,
  MatchResidentsResponse,
  ManualMatchParams,
  ManualMatchResponse,
  BatchUpdateParams,
  // Process Import Types
  ProcessImportOptions,
  ProcessImportResult,
  DuplicateCheckResult,
  // Aliases Types
  ResidentPaymentAliasWithResident,
  GetAliasesResponse,
  GetAliasResponse,
  MutateAliasResponse,
  GetAliasesWithResidentResponse,
} from './types';

// Bank Accounts
export {
  getBankAccounts,
  getBankAccount,
  createBankAccount,
  updateBankAccount,
  toggleBankAccountStatus,
  deleteBankAccount,
} from './bank-accounts';

// Create Import
export {
  createImport,
  createImportRows,
  updateImportStatus,
  deleteImport,
} from './create-import';

// Match Residents
export {
  matchImportRows,
  manualMatchRow,
  unmatchRow,
  skipRow,
  batchUpdateRowStatus,
} from './match-residents';

// Process Import
export {
  processImport,
  checkDuplicate,
  approveImport,
  rejectImport,
  submitForApproval,
} from './process-import';

// Get Imports
export {
  getImports,
  getImport,
  getImportRows,
  getImportStats,
  getImportRowSummary,
  getImportBreakdown,
  getPendingApprovalImports,
} from './get-imports';
