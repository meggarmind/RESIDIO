'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { House } from '@/types/database';
import type { HouseFormData } from '@/lib/validators/house';

export interface UpdateHouseResponse {
  data: House | null;
  error: string | null;
}

export async function updateHouse(id: string, formData: HouseFormData): Promise<UpdateHouseResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('houses')
    .update({
      house_number: formData.house_number,
      street_id: formData.street_id,
      house_type_id: formData.house_type_id || null,
      address_line_2: formData.address_line_2 || null,
      notes: formData.notes || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { data: null, error: 'A house with this number already exists on this street' };
    }
    return { data: null, error: error.message };
  }

  revalidatePath('/houses');
  revalidatePath(`/houses/${id}`);
  return { data, error: null };
}
