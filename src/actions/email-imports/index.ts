/**
 * Email Import Actions Index
 *
 * Phase 17: Gmail Bank Statement Integration
 */

// Gmail OAuth
export {
  getGmailAuthUrl,
  exchangeGmailCode,
  getGmailConnectionStatus,
  disconnectGmail,
  updateGmailSyncStatus,
} from './gmail-oauth';

// Bank Account Passwords
export {
  getBankAccountsWithPasswordStatus,
  setBankAccountPassword,
  removeBankAccountPassword,
  getDecryptedPassword,
  getPasswordByAccountLast4,
  type BankAccountWithPassword,
} from './bank-passwords';

// Email Import Sessions
export {
  createEmailImport,
  updateEmailImportStatus,
  getEmailImport,
  listEmailImports,
} from './create-email-import';

// Email Fetching
export { fetchNewEmails } from './fetch-emails';
export { resetEmailImports } from './reset-email-imports';

// Email Parsing
export { parseEmailMessage, parseAllPendingEmails } from './parse-email';

// Transaction Processing
export {
  matchEmailTransactions,
  processEmailTransactions,
  processSingleTransaction,
  skipTransaction,
  getReviewQueue,
} from './process-email-import';
