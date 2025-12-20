/**
 * Import Actions Index
 *
 * Central export for all bank statement import actions.
 */

// Bank Accounts
export {
  getBankAccounts,
  getBankAccount,
  createBankAccount,
  updateBankAccount,
  toggleBankAccountStatus,
  deleteBankAccount,
  type GetBankAccountsResponse,
  type GetBankAccountResponse,
  type MutateBankAccountResponse,
} from './bank-accounts';

// Create Import
export {
  createImport,
  createImportRows,
  updateImportStatus,
  deleteImport,
  type CreateImportParams,
  type CreateImportResponse,
  type CreateImportRowsParams,
  type CreateImportRowsResponse,
  type UpdateImportStatusParams,
} from './create-import';

// Match Residents
export {
  matchImportRows,
  manualMatchRow,
  unmatchRow,
  skipRow,
  batchUpdateRowStatus,
  type MatchRowResult,
  type MatchResidentsResponse,
  type ManualMatchResponse,
  type ManualMatchParams,
  type BatchUpdateParams,
} from './match-residents';

// Process Import
export {
  processImport,
  checkDuplicate,
  approveImport,
  rejectImport,
  submitForApproval,
  type ProcessImportOptions,
  type ProcessImportResult,
  type DuplicateCheckResult,
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
  type ImportSearchParams,
  type ImportRowSearchParams,
  type GetImportsResponse,
  type GetImportResponse,
  type GetImportRowsResponse,
  type BankStatementImportWithDetails,
  type BankStatementRowWithResident,
  type ImportStats,
  type ImportRowSummary,
  type ImportBreakdown,
  type TagBreakdownItem,
  type TransactionTypeBreakdown,
} from './get-imports';
