/**
 * Decrypted bank-statement PDF password reads.
 *
 * Deliberately NOT a server action (no 'use server'): these return decrypted secrets, and any
 * export from a 'use server' file is a client-callable endpoint. They use the session client, so
 * RLS on estate_bank_account_passwords (has_permission('email_imports.manage_passwords')) is the
 * gate. Called only from guarded server code. See #568.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/encryption';

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
  accountLast4: string
): Promise<{ data: string | null; bankAccountId: string | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

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
export async function getAllBankPasswords(): Promise<{ data: string[] | null; error: string | null }> {
  // Only internal/system use (or authorized admins)
  const supabase = await createServerSupabaseClient();

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
