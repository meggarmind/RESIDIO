/**
 * Decrypted bank-statement PDF password reads.
 *
 * Deliberately NOT a server action (no 'use server'): these return decrypted secrets, and any
 * export from a 'use server' file is a client-callable endpoint. They use the session client, so
 * RLS on estate_bank_account_passwords (has_permission('email_imports.manage_passwords')) is the
 * gate. Called only from guarded server code. See #568.
 *
 * The scheduled email import has no session, so RLS would hide every row (#884). Passing
 * `systemSource` (only the CRON_SECRET cron path does) switches the two lookups the PDF parser
 * makes to the service-role client and records each read in the System Action Log. The
 * user-facing password actions in src/actions/email-imports/bank-passwords.ts stay gated.
 */

import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/encryption';
import { recordSystemAction } from '@/lib/system-log/recorder';

export interface BankPasswordReadOptions {
  /** System Action Log source of a sessionless caller, e.g. `cron:fetch-emails`. */
  systemSource?: string;
}

async function readClient(options?: BankPasswordReadOptions) {
  return options?.systemSource ? createAdminClient() : createServerSupabaseClient();
}

async function logSystemRead(
  options: BankPasswordReadOptions | undefined,
  summary: Record<string, unknown>,
  error: string | null
) {
  if (!options?.systemSource) return;
  await recordSystemAction({
    source: options.systemSource,
    action: 'read_bank_pdf_password',
    outcome: error ? 'failure' : 'success',
    summary,
    error,
  });
}

// ============================================================
// Get Decrypted Password (internal use only)
// ============================================================

/**
 * Get the decrypted password for a bank account.
 * This should only be called by internal processes (email parsing).
 */
export async function getDecryptedPassword(
  bankAccountId: string
): Promise<{ data: string | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('estate_bank_account_passwords')
    .select('password_encrypted')
    .eq('bank_account_id', bankAccountId)
    .single();

  if (error || !data) {
    return { data: null, error: error?.message || 'Password not found' };
  }

  try {
    const password = decrypt(data.password_encrypted);
    return { data: password, error: null };
  } catch (decryptError) {
    console.error('Failed to decrypt bank password:', decryptError);
    return { data: null, error: 'Failed to decrypt password' };
  }
}

/**
 * Find password by account number last 4 digits.
 * Used when parsing emails that reference partial account numbers.
 */
export async function getPasswordByAccountLast4(
  accountLast4: string,
  options?: BankPasswordReadOptions
): Promise<{ data: string | null; bankAccountId: string | null; error: string | null }> {
  const result = await readPasswordByAccountLast4(accountLast4, options);
  await logSystemRead(
    options,
    { lookup: 'account_last4', bankAccountId: result.bankAccountId, found: result.data !== null },
    result.error
  );
  return result;
}

async function readPasswordByAccountLast4(
  accountLast4: string,
  options?: BankPasswordReadOptions
): Promise<{ data: string | null; bankAccountId: string | null; error: string | null }> {
  const supabase = await readClient(options);

  // Find bank account matching last 4 digits
  const { data: accounts, error: accountError } = await supabase
    .from('estate_bank_accounts')
    .select('id, account_number')
    .eq('is_active', true);

  if (accountError || !accounts) {
    return { data: null, bankAccountId: null, error: accountError?.message || 'No accounts found' };
  }

  // Find matching account
  const matchingAccount = accounts.find(
    (acc) => acc.account_number.slice(-4) === accountLast4
  );

  if (!matchingAccount) {
    return { data: null, bankAccountId: null, error: 'No matching account found' };
  }

  // Get password
  const { data: passwordData, error: passwordError } = await supabase
    .from('estate_bank_account_passwords')
    .select('password_encrypted')
    .eq('bank_account_id', matchingAccount.id)
    .single();

  if (passwordError || !passwordData) {
    return {
      data: null,
      bankAccountId: matchingAccount.id,
      error: passwordError?.message || 'Password not set for this account',
    };
  }

  try {
    const password = decrypt(passwordData.password_encrypted);
    return { data: password, bankAccountId: matchingAccount.id, error: null };
  } catch (decryptError) {
    console.error('Failed to decrypt bank password:', decryptError);
    return { data: null, bankAccountId: matchingAccount.id, error: 'Failed to decrypt password' };
  }
}

/**
 * Get all decrypted passwords (internal use only).
 * Used for brute-force decryption when account number is unknown.
 */
export async function getAllBankPasswords(
  options?: BankPasswordReadOptions
): Promise<{ data: string[] | null; error: string | null }> {
  const result = await readAllBankPasswords(options);
  await logSystemRead(options, { lookup: 'all', count: result.data?.length ?? 0 }, result.error);
  return result;
}

async function readAllBankPasswords(
  options?: BankPasswordReadOptions
): Promise<{ data: string[] | null; error: string | null }> {
  // Only internal/system use (or authorized admins)
  const supabase = await readClient(options);

  const { data: passwords, error } = await supabase
    .from('estate_bank_account_passwords')
    .select('password_encrypted');

  if (error) {
    return { data: null, error: error.message };
  }

  if (!passwords || passwords.length === 0) {
    return { data: [], error: null };
  }

  try {
    const decryptedPasswords = passwords
      .map((p) => {
        try {
          return decrypt(p.password_encrypted);
        } catch {
          return null;
        }
      })
      .filter((p): p is string => p !== null);

    // Return unique passwords
    return { data: Array.from(new Set(decryptedPasswords)), error: null };
  } catch (err) {
    return { data: null, error: 'Failed to decrypt passwords' };
  }
}
