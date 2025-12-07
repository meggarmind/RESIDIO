'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface DeleteResidentResponse {
  success: boolean;
  error: string | null;
}

export async function deleteResident(id: string): Promise<DeleteResidentResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Soft delete by setting account_status to archived
  const { error } = await supabase
    .from('residents')
    .update({ account_status: 'archived' })
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Deactivate all house assignments
  await supabase
    .from('resident_houses')
    .update({
      is_active: false,
      move_out_date: new Date().toISOString().split('T')[0]
    })
    .eq('resident_id', id);

  revalidatePath('/residents');
  revalidatePath('/houses');
  return { success: true, error: null };
}
