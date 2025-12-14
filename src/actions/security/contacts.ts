'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  SecurityContact,
  SecurityContactWithDetails,
  SecurityContactStatus,
} from '@/types/database';
import type {
  CreateSecurityContactData,
  UpdateSecurityContactData,
  UpdateSecurityContactStatusData,
  SecurityContactFilters,
} from '@/lib/validators/security-contact';
import { hasSecurityPermission } from './settings';
import { logAudit } from '@/lib/audit/logger';
import { getChangedValues } from '@/lib/audit/helpers';

export interface SecurityContactResponse {
  data: SecurityContact | null;
  error: string | null;
}

export interface SecurityContactsResponse {
  data: SecurityContactWithDetails[];
  count: number;
  error: string | null;
}

export interface SecurityContactDetailResponse {
  data: SecurityContactWithDetails | null;
  error: string | null;
}

/**
 * Gets a list of security contacts with pagination and filters
 */
export async function getSecurityContacts(
  filters: SecurityContactFilters = {}
): Promise<SecurityContactsResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canView = await hasSecurityPermission('view_contacts');
  if (!canView) {
    return { data: [], count: 0, error: 'Permission denied' };
  }

  const {
    search,
    resident_id,
    category_id,
    status,
    expiring_within_days,
    page = 1,
    limit = 20,
  } = filters;

  let query = supabase
    .from('security_contacts')
    .select(
      `
      *,
      category:security_contact_categories(*),
      resident:residents(id, first_name, last_name, resident_code, phone_primary),
      access_codes(*),
      created_by_profile:profiles!security_contacts_created_by_fkey(id, full_name)
    `,
      { count: 'exact' }
    );

  // Apply filters
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,phone_primary.ilike.%${search}%,id_number.ilike.%${search}%`
    );
  }

  if (resident_id) {
    query = query.eq('resident_id', resident_id);
  }

  if (category_id) {
    query = query.eq('category_id', category_id);
  }

  if (status) {
    query = query.eq('status', status);
  }

  // Note: expiring_within_days would require a more complex query
  // involving access_codes.valid_until - skipped for MVP

  // Pagination
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

  const { data, count, error } = await query;

  if (error) {
    console.error('Get security contacts error:', error);
    return { data: [], count: 0, error: 'Failed to fetch security contacts' };
  }

  return {
    data: (data || []) as unknown as SecurityContactWithDetails[],
    count: count || 0,
    error: null,
  };
}

/**
 * Gets a single security contact by ID with all related data
 */
export async function getSecurityContact(id: string): Promise<SecurityContactDetailResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canView = await hasSecurityPermission('view_contacts');
  if (!canView) {
    return { data: null, error: 'Permission denied' };
  }

  const { data, error } = await supabase
    .from('security_contacts')
    .select(
      `
      *,
      category:security_contact_categories(*),
      resident:residents(id, first_name, last_name, resident_code, phone_primary),
      access_codes(*),
      created_by_profile:profiles!security_contacts_created_by_fkey(id, full_name)
    `
    )
    .eq('id', id)
    .single();

  if (error) {
    console.error('Get security contact error:', error);
    return { data: null, error: 'Security contact not found' };
  }

  return { data: data as unknown as SecurityContactWithDetails, error: null };
}

/**
 * Gets security contacts for a specific resident
 */
export async function getResidentSecurityContacts(
  residentId: string
): Promise<SecurityContactsResponse> {
  return getSecurityContacts({ resident_id: residentId, limit: 100 });
}

/**
 * Creates a new security contact
 */
export async function createSecurityContact(
  formData: CreateSecurityContactData
): Promise<SecurityContactResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canRegister = await hasSecurityPermission('register_contacts');
  if (!canRegister) {
    return { data: null, error: 'Permission denied: Cannot register security contacts' };
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  // Verify resident exists
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id, first_name, last_name, account_status')
    .eq('id', formData.resident_id)
    .single();

  if (residentError || !resident) {
    return { data: null, error: 'Resident not found' };
  }

  if (resident.account_status !== 'active') {
    return { data: null, error: 'Cannot add security contacts to inactive residents' };
  }

  // Verify category exists and is active
  const { data: category, error: categoryError } = await supabase
    .from('security_contact_categories')
    .select('id, name, is_active')
    .eq('id', formData.category_id)
    .single();

  if (categoryError || !category) {
    return { data: null, error: 'Category not found' };
  }

  if (!category.is_active) {
    return { data: null, error: 'Cannot use inactive category' };
  }

  // Check max contacts per resident limit (if configured)
  const { data: settings } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'security_max_contacts_per_resident')
    .single();

  const maxContacts = settings?.value;
  if (maxContacts && typeof maxContacts === 'number') {
    const { count } = await supabase
      .from('security_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('resident_id', formData.resident_id)
      .in('status', ['active', 'suspended']);

    if (count && count >= maxContacts) {
      return {
        data: null,
        error: `Maximum number of contacts (${maxContacts}) reached for this resident`,
      };
    }
  }

  // Create the contact
  const { data: contact, error: createError } = await supabase
    .from('security_contacts')
    .insert({
      resident_id: formData.resident_id,
      category_id: formData.category_id,
      full_name: formData.full_name,
      phone_primary: formData.phone_primary,
      phone_secondary: formData.phone_secondary || null,
      photo_url: formData.photo_url || null,
      id_type: formData.id_type || null,
      id_number: formData.id_number || null,
      id_document_url: formData.id_document_url || null,
      address: formData.address || null,
      next_of_kin_name: formData.next_of_kin_name || null,
      next_of_kin_phone: formData.next_of_kin_phone || null,
      employer: formData.employer || null,
      relationship: formData.relationship || null,
      notes: formData.notes || null,
      status: 'active',
      created_by: user.id,
    })
    .select()
    .single();

  if (createError) {
    console.error('Create security contact error:', createError);
    return { data: null, error: 'Failed to create security contact' };
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'security_contacts',
    entityId: contact.id,
    entityDisplay: `${contact.full_name} (${category.name} for ${resident.first_name} ${resident.last_name})`,
    newValues: contact,
  });

  revalidatePath('/security');
  revalidatePath('/security/contacts');
  revalidatePath(`/residents/${formData.resident_id}`);

  return { data: contact, error: null };
}

/**
 * Updates an existing security contact
 */
export async function updateSecurityContact(
  formData: UpdateSecurityContactData
): Promise<SecurityContactResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canUpdate = await hasSecurityPermission('update_contacts');
  if (!canUpdate) {
    return { data: null, error: 'Permission denied: Cannot update security contacts' };
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  const { id, ...updateData } = formData;

  // Get existing contact for audit
  const { data: existingContact, error: fetchError } = await supabase
    .from('security_contacts')
    .select('*, category:security_contact_categories(name), resident:residents(first_name, last_name)')
    .eq('id', id)
    .single();

  if (fetchError || !existingContact) {
    return { data: null, error: 'Security contact not found' };
  }

  // Build update object (only include non-empty fields)
  const updateObject: Record<string, any> = {};
  for (const [key, value] of Object.entries(updateData)) {
    if (value !== undefined && value !== '') {
      updateObject[key] = value;
    } else if (value === '') {
      // Allow clearing optional fields
      updateObject[key] = null;
    }
  }

  if (Object.keys(updateObject).length === 0) {
    return { data: existingContact, error: null };
  }

  const { data: contact, error: updateError } = await supabase
    .from('security_contacts')
    .update(updateObject)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    console.error('Update security contact error:', updateError);
    return { data: null, error: 'Failed to update security contact' };
  }

  // Audit log with changes
  const changes = getChangedValues(existingContact, contact);
  if (Object.keys(changes.new).length > 0) {
    const categoryData = existingContact.category as unknown as { name: string } | null;
    const residentData = existingContact.resident as unknown as { first_name: string; last_name: string } | null;
    await logAudit({
      action: 'UPDATE',
      entityType: 'security_contacts',
      entityId: contact.id,
      entityDisplay: `${contact.full_name} (${categoryData?.name || 'Unknown'} for ${residentData?.first_name || ''} ${residentData?.last_name || ''})`,
      oldValues: changes.old,
      newValues: changes.new,
    });
  }

  revalidatePath('/security');
  revalidatePath('/security/contacts');
  revalidatePath(`/security/contacts/${id}`);

  return { data: contact, error: null };
}

/**
 * Updates the status of a security contact
 */
export async function updateSecurityContactStatus(
  data: UpdateSecurityContactStatusData
): Promise<SecurityContactResponse> {
  const supabase = await createServerSupabaseClient();

  // Check permission - suspend/revoke requires special permission
  const statusRequiresSuspendPermission: SecurityContactStatus[] = ['suspended', 'revoked'];
  const permission = statusRequiresSuspendPermission.includes(data.status)
    ? 'suspend_revoke_contacts'
    : 'update_contacts';

  const hasPermission = await hasSecurityPermission(permission);
  if (!hasPermission) {
    return { data: null, error: 'Permission denied' };
  }

  // Get existing contact for audit
  const { data: existingContact, error: fetchError } = await supabase
    .from('security_contacts')
    .select('*, category:security_contact_categories(name), resident:residents(first_name, last_name)')
    .eq('id', data.id)
    .single();

  if (fetchError || !existingContact) {
    return { data: null, error: 'Security contact not found' };
  }

  const { data: contact, error: updateError } = await supabase
    .from('security_contacts')
    .update({ status: data.status })
    .eq('id', data.id)
    .select()
    .single();

  if (updateError) {
    console.error('Update security contact status error:', updateError);
    return { data: null, error: 'Failed to update status' };
  }

  // Audit log
  const categoryData = existingContact.category as unknown as { name: string } | null;
  const residentData = existingContact.resident as unknown as { first_name: string; last_name: string } | null;
  await logAudit({
    action: 'UPDATE',
    entityType: 'security_contacts',
    entityId: contact.id,
    entityDisplay: `${contact.full_name} (${categoryData?.name || 'Unknown'} for ${residentData?.first_name || ''} ${residentData?.last_name || ''})`,
    oldValues: { status: existingContact.status },
    newValues: { status: data.status, reason: data.reason },
  });

  revalidatePath('/security');
  revalidatePath('/security/contacts');
  revalidatePath(`/security/contacts/${data.id}`);

  return { data: contact, error: null };
}

/**
 * Soft-deletes a security contact by setting status to revoked
 */
export async function deleteSecurityContact(id: string): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Check permission
  const canDelete = await hasSecurityPermission('suspend_revoke_contacts');
  if (!canDelete) {
    return { success: false, error: 'Permission denied' };
  }

  // Get existing contact for audit
  const { data: existingContact, error: fetchError } = await supabase
    .from('security_contacts')
    .select('*, category:security_contact_categories(name), resident:residents(first_name, last_name)')
    .eq('id', id)
    .single();

  if (fetchError || !existingContact) {
    return { success: false, error: 'Security contact not found' };
  }

  // Soft delete by setting status to revoked
  const { error: updateError } = await supabase
    .from('security_contacts')
    .update({ status: 'revoked' })
    .eq('id', id);

  if (updateError) {
    console.error('Delete security contact error:', updateError);
    return { success: false, error: 'Failed to delete security contact' };
  }

  // Also revoke all active access codes
  await supabase
    .from('access_codes')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('contact_id', id)
    .eq('is_active', true);

  // Audit log
  const categoryData = existingContact.category as unknown as { name: string } | null;
  const residentData = existingContact.resident as unknown as { first_name: string; last_name: string } | null;
  await logAudit({
    action: 'DELETE',
    entityType: 'security_contacts',
    entityId: id,
    entityDisplay: `${existingContact.full_name} (${categoryData?.name || 'Unknown'} for ${residentData?.first_name || ''} ${residentData?.last_name || ''})`,
    oldValues: existingContact,
  });

  revalidatePath('/security');
  revalidatePath('/security/contacts');

  return { success: true, error: null };
}

/**
 * Search security contacts by name, phone, or ID number
 */
export async function searchSecurityContacts(
  query: string
): Promise<SecurityContactsResponse> {
  if (!query || query.length < 2) {
    return { data: [], count: 0, error: null };
  }

  const supabase = await createServerSupabaseClient();

  // Check permission
  const canSearch = await hasSecurityPermission('search_contacts');
  if (!canSearch) {
    return { data: [], count: 0, error: 'Permission denied' };
  }

  const { data, error } = await supabase
    .from('security_contacts')
    .select(
      `
      *,
      category:security_contact_categories(*),
      resident:residents(id, first_name, last_name, resident_code, phone_primary),
      access_codes(*)
    `
    )
    .or(
      `full_name.ilike.%${query}%,phone_primary.ilike.%${query}%,id_number.ilike.%${query}%`
    )
    .eq('status', 'active')
    .limit(20);

  if (error) {
    console.error('Search security contacts error:', error);
    return { data: [], count: 0, error: 'Search failed' };
  }

  return {
    data: (data || []) as unknown as SecurityContactWithDetails[],
    count: data?.length || 0,
    error: null,
  };
}
