'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';

type DeleteHouseResponse = {
  success: boolean;
  error: string | null;
}

export async function deleteHouse(id: string): Promise<DeleteHouseResponse> {
  // Authorization check - only admin, chairman, financial_secretary can delete houses
  const auth = await authorizePermission(PERMISSIONS.HOUSES_DELETE);
  if (!auth.authorized) {
    return { success: false, error: auth.error };
  }

  const supabase = await createServerSupabaseClient();

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
  const { data: deactivated, error } = await supabase
    .from('houses')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'DEACTIVATE',
    entityType: 'houses',
    entityId: id,
    entityDisplay: deactivated?.house_number ?? id,
    oldValues: { is_active: true },
    newValues: { is_active: false },
  });

  revalidatePath('/houses');
  return { success: true, error: null };
}
