import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';

export async function reactivateResidentAfterAssignment(residentId: string, actorId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: resident, error: fetchError } = await supabase
    .from('residents')
    .select('first_name, last_name, account_status')
    .eq('id', residentId)
    .single();

  if (fetchError || !resident) return 'Resident not found';
  if (resident.account_status !== 'inactive') return null;

  const { error: updateError } = await supabase
    .from('residents')
    .update({ account_status: 'active', updated_by: actorId })
    .eq('id', residentId);

  if (updateError) return updateError.message;

  await logAudit({
    action: 'UPDATE',
    entityType: 'residents',
    entityId: residentId,
    entityDisplay: `${resident.first_name} ${resident.last_name}`,
    oldValues: { account_status: 'inactive' },
    newValues: { account_status: 'active' },
    description: 'Reactivated resident after house assignment',
  });

  return null;
}
