'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { revalidatePath } from 'next/cache';

type DeleteResidentResponse = {
  success: boolean;
  error: string | null;
}

export async function deleteResident(id: string): Promise<DeleteResidentResponse> {
  // Permission check (migrated from legacy authorizeAction)
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_DELETE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get old resident data for audit log
  const { data: oldResident } = await supabase
    .from('residents')
    .select('first_name, last_name, resident_code, account_status')
    .eq('id', id)
    .single();

  // Soft delete by setting account_status to archived
  const { error } = await supabase
    .from('residents')
    .update({ account_status: 'archived' })
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Get count of house assignments to deactivate (for audit)
  const { count: assignmentCount } = await supabase
    .from('resident_houses')
    .select('*', { count: 'exact', head: true })
    .eq('resident_id', id)
    .eq('is_active', true);

  // Deactivate all house assignments
  await supabase
    .from('resident_houses')
    .update({
      is_active: false,
      move_out_date: new Date().toISOString().split('T')[0]
    })
    .eq('resident_id', id);

  // Audit log
  const residentName = oldResident
    ? `${oldResident.first_name} ${oldResident.last_name} (${oldResident.resident_code})`
    : id;

  await logAudit({
    action: 'UPDATE',
    entityType: 'residents',
    entityId: id,
    entityDisplay: residentName,
    oldValues: { account_status: oldResident?.account_status || 'active' },
    newValues: { account_status: 'archived' },
    description: `Archived resident${assignmentCount ? `, deactivated ${assignmentCount} house assignment(s)` : ''}`,
  });

  revalidatePath('/residents');
  revalidatePath('/houses');
  return { success: true, error: null };
}
