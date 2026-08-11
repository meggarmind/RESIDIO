'use server';

import { revalidatePath } from 'next/cache';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Resident } from '@/types/database';

type ResidentOperationalStatus = 'active' | 'inactive';

type UpdateResidentStatusResponse = {
  data: Resident | null;
  error: string | null;
};

export async function updateResidentStatus(
  id: string,
  accountStatus: ResidentOperationalStatus
): Promise<UpdateResidentStatusResponse> {
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_UPDATE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();
  const { data: currentResident, error: fetchError } = await supabase
    .from('residents')
    .select('first_name, last_name, resident_code, account_status')
    .eq('id', id)
    .single();

  if (fetchError || !currentResident) return { data: null, error: 'Resident not found' };

  const { data, error } = await supabase
    .from('residents')
    .update({ account_status: accountStatus, updated_by: auth.userId })
    .eq('id', id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  await logAudit({
    action: 'UPDATE',
    entityType: 'residents',
    entityId: id,
    entityDisplay: `${currentResident.first_name} ${currentResident.last_name} (${currentResident.resident_code})`,
    oldValues: { account_status: currentResident.account_status },
    newValues: { account_status: accountStatus },
    description: `Marked resident ${accountStatus}`,
  });

  revalidatePath('/residents');
  revalidatePath(`/residents/${id}`);
  return { data: data as Resident, error: null };
}
