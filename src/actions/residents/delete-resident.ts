'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizeAction } from '@/lib/auth/authorize';
import { ACTION_ROLES } from '@/lib/auth/action-roles';
import { revalidatePath } from 'next/cache';

type DeleteResidentResponse = {
  success: boolean;
  error: string | null;
}

export async function deleteResident(id: string): Promise<DeleteResidentResponse> {
  // Authorization check - only admin, chairman, financial_secretary can delete residents
  const auth = await authorizeAction(ACTION_ROLES.residents);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const supabase = await createServerSupabaseClient();

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
