'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ResidentHouse } from '@/types/database';
import type { HouseAssignmentData } from '@/lib/validators/resident';

export interface AssignHouseResponse {
  data: ResidentHouse | null;
  error: string | null;
}

export async function assignHouse(residentId: string, formData: HouseAssignmentData): Promise<AssignHouseResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  // Check if assignment already exists
  const { data: existing } = await supabase
    .from('resident_houses')
    .select('id, is_active')
    .eq('resident_id', residentId)
    .eq('house_id', formData.house_id)
    .single();

  if (existing) {
    // If it exists but is inactive, reactivate it instead of creating new
    if (!existing.is_active) {
      // Must check for primary residence conflict before reactivating
      if (formData.is_primary) {
        const { data: existingPrimary } = await supabase
          .from('resident_houses')
          .select('id')
          .eq('resident_id', residentId)
          .eq('is_primary', true)
          .eq('is_active', true)
          .single();

        if (existingPrimary) {
          return { data: null, error: 'Resident already has a primary residence. Please unlink existing primary residence first.' };
        }
      }

      const { data: reactivated, error: reactivateError } = await supabase
        .from('resident_houses')
        .update({
          is_active: true,
          resident_role: formData.resident_role,
          is_primary: formData.is_primary,
          move_in_date: formData.move_in_date || new Date().toISOString().split('T')[0],
          move_out_date: null,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (reactivateError) {
        return { data: null, error: reactivateError.message };
      }

      revalidatePath('/residents');
      revalidatePath(`/residents/${residentId}`);
      revalidatePath('/houses');
      return { data: reactivated, error: null };
    }

    // Already active assignment
    return { data: null, error: 'Resident is already assigned to this house' };
  }

  // Check if primary residence already exists (if trying to set as primary)
  if (formData.is_primary) {
    const { data: existingPrimary } = await supabase
      .from('resident_houses')
      .select('id')
      .eq('resident_id', residentId)
      .eq('is_primary', true)
      .eq('is_active', true)
      .single();

    if (existingPrimary) {
      return { data: null, error: 'Resident already has a primary residence. Please unlink existing primary residence first.' };
    }
  }

  const { data, error } = await supabase
    .from('resident_houses')
    .insert({
      resident_id: residentId,
      house_id: formData.house_id,
      resident_role: formData.resident_role,
      is_primary: formData.is_primary,
      move_in_date: formData.move_in_date || new Date().toISOString().split('T')[0],
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath('/residents');
  revalidatePath(`/residents/${residentId}`);
  revalidatePath('/houses');
  return { data, error: null };
}
