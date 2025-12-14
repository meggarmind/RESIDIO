'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import type { ResidentPaymentAlias } from '@/types/database';
import {
  paymentAliasFormSchema,
  paymentAliasSearchSchema,
  type PaymentAliasFormData,
  type PaymentAliasSearchParams,
} from '@/lib/validators/import';

// ============================================================
// Response Types
// ============================================================

export interface GetAliasesResponse {
  data: ResidentPaymentAlias[];
  error: string | null;
}

export interface GetAliasResponse {
  data: ResidentPaymentAlias | null;
  error: string | null;
}

export interface MutateAliasResponse {
  data: ResidentPaymentAlias | null;
  error: string | null;
}

export interface ResidentPaymentAliasWithResident extends ResidentPaymentAlias {
  resident?: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
  };
}

export interface GetAliasesWithResidentResponse {
  data: ResidentPaymentAliasWithResident[];
  error: string | null;
}

// ============================================================
// Get Aliases for a Resident
// ============================================================

export async function getResidentAliases(residentId: string): Promise<GetAliasesResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('resident_payment_aliases')
    .select('*')
    .eq('resident_id', residentId)
    .order('alias_name');

  return {
    data: (data as ResidentPaymentAlias[]) ?? [],
    error: error?.message ?? null,
  };
}

// ============================================================
// Get All Aliases (with optional filters)
// ============================================================

export async function getAllAliases(
  params: Partial<PaymentAliasSearchParams> = {}
): Promise<GetAliasesWithResidentResponse> {
  const supabase = await createServerSupabaseClient();

  // Validate params
  const validationResult = paymentAliasSearchSchema.safeParse(params);
  const { resident_id, query, is_active } = validationResult.success ? validationResult.data : {};

  let dbQuery = supabase
    .from('resident_payment_aliases')
    .select(`
      *,
      resident:residents(id, first_name, last_name, resident_code)
    `)
    .order('alias_name');

  if (resident_id) {
    dbQuery = dbQuery.eq('resident_id', resident_id);
  }

  if (query) {
    dbQuery = dbQuery.ilike('alias_name', `%${query}%`);
  }

  if (typeof is_active === 'boolean') {
    dbQuery = dbQuery.eq('is_active', is_active);
  }

  const { data, error } = await dbQuery;

  return {
    data: (data as ResidentPaymentAliasWithResident[]) ?? [],
    error: error?.message ?? null,
  };
}

// ============================================================
// Get Single Alias
// ============================================================

export async function getAlias(id: string): Promise<GetAliasResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('resident_payment_aliases')
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: data as ResidentPaymentAlias | null,
    error: error?.message ?? null,
  };
}

// ============================================================
// Create Payment Alias
// ============================================================

export async function createPaymentAlias(
  formData: PaymentAliasFormData
): Promise<MutateAliasResponse> {
  const supabase = await createServerSupabaseClient();

  // Validate input
  const validationResult = paymentAliasFormSchema.safeParse(formData);
  if (!validationResult.success) {
    return {
      data: null,
      error: validationResult.error.issues[0]?.message ?? 'Invalid input',
    };
  }

  const { resident_id, alias_name, notes, is_active } = validationResult.data;

  // Check for duplicate alias name for this resident
  const { data: existing } = await supabase
    .from('resident_payment_aliases')
    .select('id')
    .eq('resident_id', resident_id)
    .ilike('alias_name', alias_name)
    .single();

  if (existing) {
    return {
      data: null,
      error: 'This alias already exists for this resident',
    };
  }

  // Get current user for created_by
  const { data: { user } } = await supabase.auth.getUser();

  // Create the alias
  const { data, error } = await supabase
    .from('resident_payment_aliases')
    .insert({
      resident_id,
      alias_name: alias_name.trim(),
      notes: notes?.trim() || null,
      is_active,
      created_by: user?.id,
    })
    .select()
    .single();

  if (error) {
    return {
      data: null,
      error: error.message,
    };
  }

  // Get resident info for audit log
  const { data: resident } = await supabase
    .from('residents')
    .select('first_name, last_name, resident_code')
    .eq('id', resident_id)
    .single();

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'resident_payment_aliases',
    entityId: data.id,
    entityDisplay: `Alias "${alias_name}" for ${resident?.first_name} ${resident?.last_name}`,
    newValues: data,
  });

  return {
    data: data as ResidentPaymentAlias,
    error: null,
  };
}

// ============================================================
// Update Payment Alias
// ============================================================

export async function updatePaymentAlias(
  id: string,
  formData: Partial<PaymentAliasFormData>
): Promise<MutateAliasResponse> {
  const supabase = await createServerSupabaseClient();

  // Get existing record for audit
  const { data: existing, error: fetchError } = await supabase
    .from('resident_payment_aliases')
    .select(`
      *,
      resident:residents(first_name, last_name, resident_code)
    `)
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return {
      data: null,
      error: 'Payment alias not found',
    };
  }

  // Check for duplicate alias name if changing
  if (formData.alias_name && formData.alias_name.toLowerCase() !== existing.alias_name.toLowerCase()) {
    const { data: duplicate } = await supabase
      .from('resident_payment_aliases')
      .select('id')
      .eq('resident_id', existing.resident_id)
      .ilike('alias_name', formData.alias_name)
      .neq('id', id)
      .single();

    if (duplicate) {
      return {
        data: null,
        error: 'This alias already exists for this resident',
      };
    }
  }

  // Update the alias
  const { data, error } = await supabase
    .from('resident_payment_aliases')
    .update({
      alias_name: formData.alias_name?.trim() ?? existing.alias_name,
      notes: formData.notes?.trim() ?? existing.notes,
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

  const resident = (existing as ResidentPaymentAliasWithResident).resident;

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'resident_payment_aliases',
    entityId: id,
    entityDisplay: `Alias "${data.alias_name}" for ${resident?.first_name} ${resident?.last_name}`,
    oldValues: { alias_name: existing.alias_name, notes: existing.notes, is_active: existing.is_active },
    newValues: { alias_name: data.alias_name, notes: data.notes, is_active: data.is_active },
  });

  return {
    data: data as ResidentPaymentAlias,
    error: null,
  };
}

// ============================================================
// Toggle Alias Active Status
// ============================================================

export async function toggleAliasStatus(id: string): Promise<MutateAliasResponse> {
  const supabase = await createServerSupabaseClient();

  // Get existing record
  const { data: existing, error: fetchError } = await supabase
    .from('resident_payment_aliases')
    .select(`
      *,
      resident:residents(first_name, last_name)
    `)
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return {
      data: null,
      error: 'Payment alias not found',
    };
  }

  const newStatus = !existing.is_active;

  // Update status
  const { data, error } = await supabase
    .from('resident_payment_aliases')
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

  const resident = (existing as ResidentPaymentAliasWithResident).resident;

  // Audit log
  await logAudit({
    action: newStatus ? 'ACTIVATE' : 'DEACTIVATE',
    entityType: 'resident_payment_aliases',
    entityId: id,
    entityDisplay: `Alias "${existing.alias_name}" for ${resident?.first_name} ${resident?.last_name}`,
    oldValues: { is_active: existing.is_active },
    newValues: { is_active: newStatus },
  });

  return {
    data: data as ResidentPaymentAlias,
    error: null,
  };
}

// ============================================================
// Delete Payment Alias
// ============================================================

export async function deletePaymentAlias(id: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get existing record for audit
  const { data: existing, error: fetchError } = await supabase
    .from('resident_payment_aliases')
    .select(`
      *,
      resident:residents(first_name, last_name)
    `)
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return { error: 'Payment alias not found' };
  }

  // Delete the alias
  const { error } = await supabase
    .from('resident_payment_aliases')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  const resident = (existing as ResidentPaymentAliasWithResident).resident;

  // Audit log
  await logAudit({
    action: 'DELETE',
    entityType: 'resident_payment_aliases',
    entityId: id,
    entityDisplay: `Alias "${existing.alias_name}" for ${resident?.first_name} ${resident?.last_name}`,
    oldValues: existing,
  });

  return { error: null };
}

// ============================================================
// Find Alias by Name (for matching engine)
// ============================================================

export async function findAliasByName(aliasName: string): Promise<{
  data: ResidentPaymentAliasWithResident | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('resident_payment_aliases')
    .select(`
      *,
      resident:residents(id, first_name, last_name, resident_code)
    `)
    .eq('is_active', true)
    .ilike('alias_name', aliasName.trim())
    .single();

  return {
    data: data as ResidentPaymentAliasWithResident | null,
    error: error?.code === 'PGRST116' ? null : error?.message ?? null, // PGRST116 = no rows returned
  };
}

// ============================================================
// Get All Active Aliases (for matching engine preload)
// ============================================================

export async function getAllActiveAliases(): Promise<GetAliasesWithResidentResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('resident_payment_aliases')
    .select(`
      *,
      resident:residents(id, first_name, last_name, resident_code)
    `)
    .eq('is_active', true)
    .order('alias_name');

  return {
    data: (data as ResidentPaymentAliasWithResident[]) ?? [],
    error: error?.message ?? null,
  };
}
