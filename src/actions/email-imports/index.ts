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
} from './gmail-oauth';

// Bank Account Passwords
export {
  getBankAccountsWithPasswordStatus,
  setBankAccountPassword,
  removeBankAccountPassword,
  type BankAccountWithPassword,
} from './bank-passwords';

// Email Import Sessions
export {
  getEmailImport,
  listEmailImports,
} from './create-email-import';

// Email Fetching
export { fetchNewEmails } from './fetch-emails';
export { resetEmailImports } from './reset-email-imports';

// Transaction Processing
// (parseEmailMessage, parseAllPendingEmails, matchEmailTransactions and
// updateGmailSyncStatus live in src/lib/email-imports/ - service-role, not actions; #561)
export {
  processEmailTransactions,
  processSingleTransaction,
  skipTransaction,
  getReviewQueue,
} from './process-email-import';
