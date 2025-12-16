'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import type { EstateBankAccount } from '@/types/database';
import { estateBankAccountFormSchema, type EstateBankAccountFormData } from '@/lib/validators/import';
import { canAutoApprove, createApprovalRequest } from '@/actions/approvals';

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
  requiresApproval?: boolean;
  approvalRequestId?: string;
}

export interface DeleteBankAccountResponse {
  error: string | null;
  requiresApproval?: boolean;
  approvalRequestId?: string;
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

  const { account_number, account_name, bank_name, description, is_active } = validationResult.data;

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

  // Check if user can auto-approve
  const autoApprove = await canAutoApprove();

  if (!autoApprove) {
    // Create approval request instead of directly creating
    const approvalResult = await createApprovalRequest({
      request_type: 'bank_account_create',
      entity_type: 'estate_bank_account',
      entity_id: 'pending', // Placeholder - will be updated when approved
      requested_changes: {
        account_number,
        account_name,
        bank_name,
        description: description || null,
        is_active: is_active ?? true,
      },
      current_values: {},
      reason: `New bank account: ${account_name} (${account_number})`,
    });

    if (!approvalResult.success) {
      return {
        data: null,
        error: approvalResult.error ?? 'Failed to create approval request',
      };
    }

    return {
      data: null,
      error: null,
      requiresApproval: true,
      approvalRequestId: approvalResult.request_id,
    };
  }

  // Create the account directly (admin/chairman)
  const { data, error } = await supabase
    .from('estate_bank_accounts')
    .insert({
      account_number,
      account_name,
      bank_name,
      description: description || null,
      is_active: is_active ?? true,
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

  // Check if user can auto-approve
  const autoApprove = await canAutoApprove();

  if (!autoApprove) {
    // Create approval request instead of directly updating
    const approvalResult = await createApprovalRequest({
      request_type: 'bank_account_update',
      entity_type: 'estate_bank_account',
      entity_id: id,
      requested_changes: {
        account_number: formData.account_number ?? existing.account_number,
        account_name: formData.account_name ?? existing.account_name,
        bank_name: formData.bank_name ?? existing.bank_name,
        description: formData.description !== undefined ? (formData.description || null) : existing.description,
        is_active: formData.is_active ?? existing.is_active,
      },
      current_values: {
        account_number: existing.account_number,
        account_name: existing.account_name,
        bank_name: existing.bank_name,
        description: existing.description,
        is_active: existing.is_active,
      },
      reason: `Update bank account: ${existing.account_name} (${existing.account_number})`,
    });

    if (!approvalResult.success) {
      return {
        data: null,
        error: approvalResult.error ?? 'Failed to create approval request',
      };
    }

    return {
      data: existing as EstateBankAccount,
      error: null,
      requiresApproval: true,
      approvalRequestId: approvalResult.request_id,
    };
  }

  // Update the account directly (admin/chairman)
  const { data, error } = await supabase
    .from('estate_bank_accounts')
    .update({
      account_number: formData.account_number ?? existing.account_number,
      account_name: formData.account_name ?? existing.account_name,
      bank_name: formData.bank_name ?? existing.bank_name,
      description: formData.description !== undefined ? (formData.description || null) : existing.description,
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

  // Check if user can auto-approve
  const autoApprove = await canAutoApprove();

  if (!autoApprove) {
    // Create approval request
    const approvalResult = await createApprovalRequest({
      request_type: 'bank_account_update',
      entity_type: 'estate_bank_account',
      entity_id: id,
      requested_changes: { is_active: newStatus },
      current_values: { is_active: existing.is_active },
      reason: `${newStatus ? 'Activate' : 'Deactivate'} bank account: ${existing.account_name}`,
    });

    if (!approvalResult.success) {
      return {
        data: null,
        error: approvalResult.error ?? 'Failed to create approval request',
      };
    }

    return {
      data: existing as EstateBankAccount,
      error: null,
      requiresApproval: true,
      approvalRequestId: approvalResult.request_id,
    };
  }

  // Update status directly (admin/chairman)
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
// Delete Bank Account (Soft Delete via is_active if has history)
// ============================================================

export async function deleteBankAccount(id: string): Promise<DeleteBankAccountResponse> {
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

  // Check if user can auto-approve
  const autoApprove = await canAutoApprove();

  if (!autoApprove) {
    // Create approval request
    const approvalResult = await createApprovalRequest({
      request_type: 'bank_account_delete',
      entity_type: 'estate_bank_account',
      entity_id: id,
      requested_changes: {},
      current_values: {
        account_number: existing.account_number,
        account_name: existing.account_name,
        bank_name: existing.bank_name,
        description: existing.description,
        is_active: existing.is_active,
      },
      reason: `Delete bank account: ${existing.account_name} (${existing.account_number})`,
    });

    if (!approvalResult.success) {
      return {
        error: approvalResult.error ?? 'Failed to create approval request',
      };
    }

    return {
      error: null,
      requiresApproval: true,
      approvalRequestId: approvalResult.request_id,
    };
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
      metadata: { reason: 'Soft delete - account has import history' },
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

// ============================================================
// Direct Create Bank Account (for approval execution)
// Used internally when an approval request is approved
// ============================================================

export async function createBankAccountDirect(
  data: {
    account_number: string;
    account_name: string;
    bank_name: string;
    description?: string | null;
    is_active?: boolean;
  },
  approvalId?: string
): Promise<MutateBankAccountResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: created, error } = await supabase
    .from('estate_bank_accounts')
    .insert({
      account_number: data.account_number,
      account_name: data.account_name,
      bank_name: data.bank_name,
      description: data.description || null,
      is_active: data.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'estate_bank_accounts',
    entityId: created.id,
    entityDisplay: `${data.bank_name} - ${data.account_number}`,
    newValues: created,
    metadata: approvalId ? { approval_id: approvalId } : undefined,
  });

  return { data: created as EstateBankAccount, error: null };
}

// ============================================================
// Direct Update Bank Account (for approval execution)
// Used internally when an approval request is approved
// ============================================================

export async function updateBankAccountDirect(
  id: string,
  data: Partial<{
    account_number: string;
    account_name: string;
    bank_name: string;
    description: string | null;
    is_active: boolean;
  }>,
  approvalId?: string
): Promise<MutateBankAccountResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from('estate_bank_accounts')
    .select('*')
    .eq('id', id)
    .single();

  if (!existing) {
    return { data: null, error: 'Bank account not found' };
  }

  const { data: updated, error } = await supabase
    .from('estate_bank_accounts')
    .update({
      account_number: data.account_number ?? existing.account_number,
      account_name: data.account_name ?? existing.account_name,
      bank_name: data.bank_name ?? existing.bank_name,
      description: data.description !== undefined ? data.description : existing.description,
      is_active: data.is_active ?? existing.is_active,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'estate_bank_accounts',
    entityId: id,
    entityDisplay: `${updated.bank_name} - ${updated.account_number}`,
    oldValues: existing,
    newValues: updated,
    metadata: approvalId ? { approval_id: approvalId } : undefined,
  });

  return { data: updated as EstateBankAccount, error: null };
}

// ============================================================
// Direct Delete Bank Account (for approval execution)
// Used internally when an approval request is approved
// ============================================================

export async function deleteBankAccountDirect(
  id: string,
  approvalId?: string
): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: existing } = await supabase
    .from('estate_bank_accounts')
    .select('*')
    .eq('id', id)
    .single();

  if (!existing) {
    return { error: 'Bank account not found' };
  }

  // Check if account has any imports
  const { count: importCount } = await supabase
    .from('bank_statement_imports')
    .select('*', { count: 'exact', head: true })
    .eq('bank_account_id', id);

  if (importCount && importCount > 0) {
    // Soft delete
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
      metadata: {
        approval_id: approvalId,
        reason: 'Soft delete - account has import history',
      },
    });
  } else {
    // Hard delete
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
      metadata: approvalId ? { approval_id: approvalId } : undefined,
    });
  }

  return { error: null };
}
