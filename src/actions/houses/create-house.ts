'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { House } from '@/types/database';
import type { HouseFormData } from '@/lib/validators/house';

export interface CreateHouseResponse {
  data: House | null;
  error: string | null;
}

export async function createHouse(formData: HouseFormData): Promise<CreateHouseResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('houses')
    .insert({
      house_number: formData.house_number,
      street_id: formData.street_id,
      house_type_id: formData.house_type_id || null,
      address_line_2: formData.address_line_2 || null,
      notes: formData.notes || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { data: null, error: 'A house with this number already exists on this street' };
    }
    return { data: null, error: error.message };
  }

  revalidatePath('/houses');
  return { data, error: null };
}
