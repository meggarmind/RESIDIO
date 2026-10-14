'use server';

/**
 * Bank Account Password Server Actions
 *
 * Manages encrypted PDF statement passwords for bank accounts.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { encrypt } from '@/lib/encryption';

// ============================================================
// Types
// ============================================================

export interface BankAccountWithPassword {
  id: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  is_active: boolean;
  has_password: boolean;
}

// ============================================================
// Get Bank Accounts with Password Status
// ============================================================

export async function getBankAccountsWithPasswordStatus(): Promise<{
  data: BankAccountWithPassword[] | null;
  error: string | null;
}> {
  // Check permission
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_VIEW);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get all bank accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('estate_bank_accounts')
    .select('id, account_number, account_name, bank_name, is_active')
    .order('bank_name');

  if (accountsError) {
    return { data: null, error: accountsError.message };
  }

  // Get accounts that have passwords set
  const { data: passwords, error: passwordsError } = await supabase
    .from('estate_bank_account_passwords')
    .select('bank_account_id');

  if (passwordsError) {
    return { data: null, error: passwordsError.message };
  }

  const accountsWithPasswords = new Set(passwords?.map((p) => p.bank_account_id));

  // Merge data
  const result: BankAccountWithPassword[] =
    accounts?.map((account) => ({
      ...account,
      has_password: accountsWithPasswords.has(account.id),
    })) || [];

  return { data: result, error: null };
}

// ============================================================
// Set Bank Account Password
// ============================================================

export async function setBankAccountPassword(
  bankAccountId: string,
  password: string
): Promise<{ error: string | null }> {
  // Check permission
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_MANAGE_PASSWORDS);
  if (!auth.authorized) {
    return { error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Verify bank account exists
  const { data: account, error: accountError } = await supabase
    .from('estate_bank_accounts')
    .select('id, account_name, bank_name')
    .eq('id', bankAccountId)
    .single();

  if (accountError || !account) {
    return { error: 'Bank account not found' };
  }

  // Check if password already exists
  const { data: existingPassword } = await supabase
    .from('estate_bank_account_passwords')
    .select('id')
    .eq('bank_account_id', bankAccountId)
    .single();

  // Encrypt password
  const encryptedPassword = encrypt(password);

  if (existingPassword) {
    // Update existing
    const { error: updateError } = await supabase
      .from('estate_bank_account_passwords')
      .update({
        password_encrypted: encryptedPassword,
        updated_by: auth.userId,
      })
      .eq('id', existingPassword.id);

    if (updateError) {
      return { error: updateError.message };
    }

    // Audit log
    await logAudit({
      action: 'UPDATE',
      entityType: 'estate_bank_account_passwords',
      entityId: bankAccountId,
      entityDisplay: `${account.bank_name} - ${account.account_name}`,
      newValues: { password_updated: true },
    });
  } else {
    // Insert new
    const { error: insertError } = await supabase
      .from('estate_bank_account_passwords')
      .insert({
        bank_account_id: bankAccountId,
        password_encrypted: encryptedPassword,
        updated_by: auth.userId,
      });

    if (insertError) {
      return { error: insertError.message };
    }

    // Audit log
    await logAudit({
      action: 'CREATE',
      entityType: 'estate_bank_account_passwords',
      entityId: bankAccountId,
      entityDisplay: `${account.bank_name} - ${account.account_name}`,
      newValues: { password_set: true },
    });
  }

  return { error: null };
}

// ============================================================
// Remove Bank Account Password
// ============================================================

export async function removeBankAccountPassword(
  bankAccountId: string
): Promise<{ error: string | null }> {
  // Check permission
  const auth = await authorizePermission(PERMISSIONS.EMAIL_IMPORTS_MANAGE_PASSWORDS);
  if (!auth.authorized) {
    return { error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get account info for audit
  const { data: account } = await supabase
    .from('estate_bank_accounts')
    .select('account_name, bank_name')
    .eq('id', bankAccountId)
    .single();

  // Delete password
  const { error } = await supabase
    .from('estate_bank_account_passwords')
    .delete()
    .eq('bank_account_id', bankAccountId);

  if (error) {
    return { error: error.message };
  }

  // Audit log
  if (account) {
    await logAudit({
      action: 'DELETE',
      entityType: 'estate_bank_account_passwords',
      entityId: bankAccountId,
      entityDisplay: `${account.bank_name} - ${account.account_name}`,
      oldValues: { password_removed: true },
    });
  }

  return { error: null };
}
