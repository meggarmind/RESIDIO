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
    .select('id')
    .eq('resident_id', residentId)
    .eq('house_id', formData.house_id)
    .single();

  if (existing) {
    return { data: null, error: 'Resident is already assigned to this house' };
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
