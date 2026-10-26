'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit, getChangedValues } from '@/lib/audit/logger';
import { DUES_REMINDER_TARGETS } from '@/lib/billing/landlord-dues';

const settingSchema = z.object({
  duesPaidByLandlord: z.boolean(),
  duesReminderTarget: z.enum(DUES_REMINDER_TARGETS),
});

/** House setting "Dues paid by landlord" and who gets its dues reminders (#1192). */
export async function updateHouseDuesSetting(
  houseId: string,
  input: z.input<typeof settingSchema>,
): Promise<{ error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.HOUSES_UPDATE);
  if (!auth.authorized) return { error: auth.error || 'Unauthorized' };

  const parsed = settingSchema.safeParse(input);
  if (!parsed.success || !z.string().uuid().safeParse(houseId).success) {
    return { error: 'Invalid house setting' };
  }

  const supabase = await createServerSupabaseClient();
  const { data: oldRecord, error: fetchError } = await supabase
    .from('houses')
    .select('id, house_number, dues_paid_by_landlord, dues_reminder_target')
    .eq('id', houseId)
    .single();
  if (fetchError || !oldRecord) return { error: 'House not found' };

  const { data, error } = await supabase
    .from('houses')
    .update({
      dues_paid_by_landlord: parsed.data.duesPaidByLandlord,
      dues_reminder_target: parsed.data.duesReminderTarget,
    })
    .eq('id', houseId)
    .select('id, house_number, dues_paid_by_landlord, dues_reminder_target')
    .single();
  if (error || !data) return { error: error?.message || 'Failed to update house' };

  const changes = getChangedValues(oldRecord, data);
  await logAudit({
    action: 'UPDATE',
    entityType: 'houses',
    entityId: houseId,
    entityDisplay: data.house_number,
    oldValues: changes.old,
    newValues: changes.new,
    description: 'Dues paid by landlord setting',
  });

  revalidatePath(`/houses/${houseId}`);
  return { error: null };
}
