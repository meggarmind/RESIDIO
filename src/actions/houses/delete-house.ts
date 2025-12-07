'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface DeleteHouseResponse {
  success: boolean;
  error: string | null;
}

export async function deleteHouse(id: string): Promise<DeleteHouseResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Check if house has active residents
  const { data: residents } = await supabase
    .from('resident_houses')
    .select('id')
    .eq('house_id', id)
    .eq('is_active', true)
    .limit(1);

  if (residents && residents.length > 0) {
    return { success: false, error: 'Cannot delete a house with active residents' };
  }

  // Soft delete by setting is_active to false
  const { error } = await supabase
    .from('houses')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/houses');
  return { success: true, error: null };
}
