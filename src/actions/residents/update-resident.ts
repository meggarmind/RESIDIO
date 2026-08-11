'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { revalidatePath } from 'next/cache';
import type { Resident } from '@/types/database';
import type { ResidentFormData } from '@/lib/validators/resident';

type UpdateResidentResponse = {
  data: Resident | null;
  error: string | null;
}

export async function updateResident(id: string, formData: ResidentFormData): Promise<UpdateResidentResponse> {
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_UPDATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error };
  }

  const supabase = await createServerSupabaseClient();

  // Validate corporate entity fields
  if (formData.entity_type === 'corporate' && !formData.company_name?.trim()) {
    return { data: null, error: 'Company name is required for corporate entities' };
  }

  // Fetch current resident to check for contact changes
  const { data: currentResident, error: fetchError } = await supabase
    .from('residents')
    .select('email, phone_primary, email_verified_at, phone_verified_at, first_name, last_name')
    .eq('id', id)
    .single();

  if (fetchError) {
    return { data: null, error: 'Failed to fetch current resident data' };
  }

  // Determine if contacts have changed
  const emailChanged = (formData.email || null) !== currentResident.email;
  const phoneChanged = formData.phone_primary !== currentResident.phone_primary;

  // Prepare update object
  const updateData: Record<string, unknown> = {
    first_name: formData.first_name,
    last_name: formData.last_name,
    email: formData.email || null,
    phone_primary: formData.phone_primary,
    phone_secondary: formData.phone_secondary || null,
    resident_type: formData.resident_type,
    // Entity type fields
    entity_type: formData.entity_type || 'individual',
    company_name: formData.company_name || null,
    rc_number: formData.rc_number || null,
    liaison_contact_name: formData.liaison_contact_name || null,
    liaison_contact_phone: formData.liaison_contact_phone || null,
    // Emergency contact
    emergency_contact_name: formData.emergency_contact_name || null,
    emergency_contact_phone: formData.emergency_contact_phone || null,
    emergency_contact_relationship: formData.emergency_contact_relationship || null,
    notes: formData.notes || null,
    updated_by: auth.userId,
  };

  // Reset verification status if contact info has changed.
  if (emailChanged) {
    updateData.email_verified_at = null;
  }

  if (phoneChanged) {
    updateData.phone_verified_at = null;

  }

  const { data, error } = await supabase
    .from('residents')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'residents',
    entityId: id,
    entityDisplay: `${currentResident.first_name} ${currentResident.last_name}`,
    oldValues: {
      email: currentResident.email,
      phone_primary: currentResident.phone_primary,
      email_verified_at: currentResident.email_verified_at,
      phone_verified_at: currentResident.phone_verified_at,
    },
    newValues: {
      email: formData.email || null,
      phone_primary: formData.phone_primary,
      email_verified_at: emailChanged ? null : currentResident.email_verified_at,
      phone_verified_at: phoneChanged ? null : currentResident.phone_verified_at,
    },
    description: 'Updated resident profile',
  });

  revalidatePath('/residents');
  revalidatePath(`/residents/${id}`);
  revalidatePath('/portal/profile');
  return { data, error: null };
}
