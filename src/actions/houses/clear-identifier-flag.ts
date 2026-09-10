'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit, getChangedValues } from '@/lib/audit/logger';
import { revalidatePath } from 'next/cache';
import type { HouseWithStreet } from '@/types/database';

type ClearIdentifierFlagResponse = {
  data: HouseWithStreet | null;
  error: string | null;
};

/**
 * Issue #119 -- confirm a doubted house identifier.
 *
 * The manual register wrote `?` for a character the recorder was unsure of.
 * The identifier itself is never rewritten by this action: all it does is
 * clear the `identifier_unverified` flag once a human has confirmed the value
 * on site, which empties the row out of the remediation queue.
 *
 * This is a write, so it takes the full contract from `CORE.md` §6: the
 * `houses.update` permission first, and an audit record after success. It
 * deliberately reuses `HOUSES_UPDATE` rather than inventing a permission --
 * anyone who may edit a house may confirm its identifier.
 */
export async function clearIdentifierFlag(
  id: string,
  note?: string | null
): Promise<ClearIdentifierFlagResponse> {
  const auth = await authorizePermission(PERMISSIONS.HOUSES_UPDATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: currentHouse, error: fetchError } = await supabase
    .from('houses')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !currentHouse) {
    return { data: null, error: 'House not found' };
  }

  const { data, error } = await supabase
    .from('houses')
    .update({
      identifier_unverified: false,
      // A note supplied at confirmation time records what settled the doubt.
      // Passing nothing leaves whatever context was already there.
      identifier_note: note === undefined ? currentHouse.identifier_note : note || null,
    })
    .eq('id', id)
    .select(`
      *,
      street:streets(*),
      house_type:house_types(*)
    `)
    .single();

  if (error) {
    console.error('[clearIdentifierFlag] Failed to clear identifier flag', {
      houseId: id,
      error,
    });
    return { data: null, error: error.message };
  }

  const changes = getChangedValues(currentHouse, data);
  await logAudit({
    action: 'UPDATE',
    entityType: 'houses',
    entityId: id,
    entityDisplay: data.short_name || data.house_number,
    oldValues: changes.old,
    newValues: changes.new,
    description: `Confirmed house identifier ${data.house_number}`,
  });

  revalidatePath('/houses');
  revalidatePath('/houses/unverified');
  revalidatePath(`/houses/${id}`);

  return { data: data as HouseWithStreet, error: null };
}
