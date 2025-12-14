'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import type { EstateBankAccount } from '@/types/database';
import { estateBankAccountFormSchema, type EstateBankAccountFormData } from '@/lib/validators/import';

// ============================================================
// Response Types
// ============================================================

export interface GetBankAccountsResponse {
  data: EstateBankAccount[];
  error: string | null;
}

export interface GetBankAccountResponse {
  data: EstateBankAccount | null;
  error: string | null;
}

export interface MutateBankAccountResponse {
  data: EstateBankAccount | null;
  error: string | null;
}

// ============================================================
// Get All Bank Accounts
// ============================================================

export async function getBankAccounts(includeInactive = false): Promise<GetBankAccountsResponse> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('estate_bank_accounts')
    .select('*')
    .order('account_name');

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  return {
    data: (data as EstateBankAccount[]) ?? [],
    error: error?.message ?? null,
  };
}

// ============================================================
// Get Single Bank Account
// ============================================================

export async function getBankAccount(id: string): Promise<GetBankAccountResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('estate_bank_accounts')
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: data as EstateBankAccount | null,
    error: error?.message ?? null,
  };
}

// ============================================================
// Create Bank Account
// ============================================================

export async function createBankAccount(
  formData: EstateBankAccountFormData
): Promise<MutateBankAccountResponse> {
  const supabase = await createServerSupabaseClient();

  // Validate input
  const validationResult = estateBankAccountFormSchema.safeParse(formData);
  if (!validationResult.success) {
    return {
      data: null,
      error: validationResult.error.issues[0]?.message ?? 'Invalid input',
    };
  }

  const { account_number, account_name, bank_name, is_active } = validationResult.data;

  // Check for duplicate account number
  const { data: existing } = await supabase
    .from('estate_bank_accounts')
    .select('id')
    .eq('account_number', account_number)
    .single();

  if (existing) {
    return {
      data: null,
      error: 'An account with this account number already exists',
    };
  }

  // Create the account
  const { data, error } = await supabase
    .from('estate_bank_accounts')
    .insert({
      account_number,
      account_name,
      bank_name,
      is_active,
    })
    .select()
    .single();

  if (error) {
    return {
      data: null,
      error: error.message,
    };
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'estate_bank_accounts',
    entityId: data.id,
    entityDisplay: `${bank_name} - ${account_number}`,
    newValues: data,
  });

  return {
    data: data as EstateBankAccount,
    error: null,
  };
}

// ============================================================
// Update Bank Account
// ============================================================

export async function updateBankAccount(
  id: string,
  formData: Partial<EstateBankAccountFormData>
): Promise<MutateBankAccountResponse> {
  const supabase = await createServerSupabaseClient();

  // Get existing record for audit
  const { data: existing, error: fetchError } = await supabase
    .from('estate_bank_accounts')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return {
      data: null,
      error: 'Bank account not found',
    };
  }

  // Check for duplicate account number if changing
  if (formData.account_number && formData.account_number !== existing.account_number) {
    const { data: duplicate } = await supabase
      .from('estate_bank_accounts')
      .select('id')
      .eq('account_number', formData.account_number)
      .neq('id', id)
      .single();

    if (duplicate) {
      return {
        data: null,
        error: 'An account with this account number already exists',
      };
    }
  }

  // Update the account
  const { data, error } = await supabase
    .from('estate_bank_accounts')
    .update({
      account_number: formData.account_number ?? existing.account_number,
      account_name: formData.account_name ?? existing.account_name,
      bank_name: formData.bank_name ?? existing.bank_name,
      is_active: formData.is_active ?? existing.is_active,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return {
      data: null,
      error: error.message,
    };
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'estate_bank_accounts',
    entityId: id,
    entityDisplay: `${data.bank_name} - ${data.account_number}`,
    oldValues: existing,
    newValues: data,
  });

  return {
    data: data as EstateBankAccount,
    error: null,
  };
}

// ============================================================
// Toggle Bank Account Active Status
// ============================================================

export async function toggleBankAccountStatus(id: string): Promise<MutateBankAccountResponse> {
  const supabase = await createServerSupabaseClient();

  // Get existing record
  const { data: existing, error: fetchError } = await supabase
    .from('estate_bank_accounts')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return {
      data: null,
      error: 'Bank account not found',
    };
  }

  const newStatus = !existing.is_active;

  // Update status
  const { data, error } = await supabase
    .from('estate_bank_accounts')
    .update({ is_active: newStatus })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return {
      data: null,
      error: error.message,
    };
  }

  // Audit log
  await logAudit({
    action: newStatus ? 'ACTIVATE' : 'DEACTIVATE',
    entityType: 'estate_bank_accounts',
    entityId: id,
    entityDisplay: `${data.bank_name} - ${data.account_number}`,
    oldValues: { is_active: existing.is_active },
    newValues: { is_active: newStatus },
  });

  return {
    data: data as EstateBankAccount,
    error: null,
  };
}

// ============================================================
// Delete Bank Account (Soft Delete via is_active)
// ============================================================

export async function deleteBankAccount(id: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get existing record
  const { data: existing, error: fetchError } = await supabase
    .from('estate_bank_accounts')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return { error: 'Bank account not found' };
  }

  // Check if account has any imports
  const { count: importCount } = await supabase
    .from('bank_statement_imports')
    .select('*', { count: 'exact', head: true })
    .eq('bank_account_id', id);

  if (importCount && importCount > 0) {
    // Soft delete if has history
    const { error } = await supabase
      .from('estate_bank_accounts')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      return { error: error.message };
    }

    await logAudit({
      action: 'DEACTIVATE',
      entityType: 'estate_bank_accounts',
      entityId: id,
      entityDisplay: `${existing.bank_name} - ${existing.account_number}`,
      oldValues: existing,
    });
  } else {
    // Hard delete if no history
    const { error } = await supabase
      .from('estate_bank_accounts')
      .delete()
      .eq('id', id);

    if (error) {
      return { error: error.message };
    }

    await logAudit({
      action: 'DELETE',
      entityType: 'estate_bank_accounts',
      entityId: id,
      entityDisplay: `${existing.bank_name} - ${existing.account_number}`,
      oldValues: existing,
    });
  }

  return { error: null };
}
