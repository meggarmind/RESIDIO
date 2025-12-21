'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizeAction } from '@/lib/auth/authorize';
import { ACTION_ROLES } from '@/lib/auth/action-roles';
import { revalidatePath } from 'next/cache';
import type { Resident } from '@/types/database';
import type { ResidentFormData } from '@/lib/validators/resident';

type UpdateResidentResponse = {
  data: Resident | null;
  error: string | null;
}

export async function updateResident(id: string, formData: ResidentFormData): Promise<UpdateResidentResponse> {
  // Authorization check - only admin, chairman, financial_secretary can update residents
  const auth = await authorizeAction(ACTION_ROLES.residents);
  if (!auth.authorized) {
    return { data: null, error: auth.error };
  }

  const supabase = await createServerSupabaseClient();

  // Validate corporate entity fields
  if (formData.entity_type === 'corporate' && !formData.company_name?.trim()) {
    return { data: null, error: 'Company name is required for corporate entities' };
  }

  const { data, error } = await supabase
    .from('residents')
    .update({
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
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath('/residents');
  revalidatePath(`/residents/${id}`);
  return { data, error: null };
}
