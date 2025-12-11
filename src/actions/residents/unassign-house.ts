'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface UnassignHouseResponse {
  success: boolean;
  error: string | null;
}

export async function unassignHouse(residentId: string, houseId: string): Promise<UnassignHouseResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Deactivate the assignment (soft delete)
  const { error } = await supabase
    .from('resident_houses')
    .update({
      is_active: false,
      move_out_date: new Date().toISOString().split('T')[0]
    })
    .eq('resident_id', residentId)
    .eq('house_id', houseId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/residents');
  revalidatePath(`/residents/${residentId}`);
  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);
  return { success: true, error: null };
}
