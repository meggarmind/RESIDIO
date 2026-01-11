'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ResidentRole } from '@/types/database';

type MoveOutLandlordResponse = {
  success: boolean;
  error: string | null;
  movedOutResidents?: number; // Count of secondary residents that were also removed
}

/**
 * Move out a Resident Landlord from a house
 *
 * This action:
 * 1. Converts the resident_landlord to non_resident_landlord (still owns, doesn't reside)
 * 2. Removes (deactivates) all secondary residents from the house
 * 3. Records the event in ownership history
 *
 * The resident retains ownership but no longer physically resides at the property.
 * The house state transitions to "Vacant - Landlord assigned".
 */
export async function moveOutLandlord(
  residentId: string,
  houseId: string,
  moveOutDate?: string,
  notes?: string
): Promise<MoveOutLandlordResponse> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  if (!residentId || !houseId) {
    return { success: false, error: 'Resident ID and House ID are required' };
  }

  const today = moveOutDate || new Date().toISOString().split('T')[0];

  // Verify the resident is a resident_landlord at this house
  const { data: assignment, error: assignmentError } = await supabase
    .from('resident_houses')
    .select('id, resident_role')
    .eq('resident_id', residentId)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .single();

  if (assignmentError || !assignment) {
    return { success: false, error: 'Resident is not currently assigned to this house' };
  }

  if (assignment.resident_role !== 'resident_landlord') {
    return {
      success: false,
      error: `Only Owner-Occupiers can use Move Out. This resident is a ${assignment.resident_role}.`
    };
  }

  // Get count of secondary residents to remove (includes contractor added in Phase 15)
  const { data: secondaryResidents, error: secondaryError } = await supabase
    .from('resident_houses')
    .select('id, resident_id')
    .eq('house_id', houseId)
    .eq('is_active', true)
    .in('resident_role', ['co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor']);

  if (secondaryError) {
    console.error('[moveOutLandlord] Error fetching secondary residents:', secondaryError);
    return { success: false, error: 'Failed to check secondary residents' };
  }

  const secondaryCount = secondaryResidents?.length || 0;

  // Start the move-out process
  // 1. Convert resident_landlord to non_resident_landlord
  const { error: updateError } = await supabase
    .from('resident_houses')
    .update({
      resident_role: 'non_resident_landlord' as ResidentRole,
      move_out_date: today,
      // Note: is_active remains true since they're still the owner
    })
    .eq('id', assignment.id);

  if (updateError) {
    console.error('[moveOutLandlord] Error updating role:', updateError);
    return { success: false, error: 'Failed to update resident role' };
  }

  // 2. Deactivate all secondary residents (includes contractor added in Phase 15)
  if (secondaryCount > 0) {
    const { error: cascadeError } = await supabase
      .from('resident_houses')
      .update({
        is_active: false,
        move_out_date: today,
      })
      .eq('house_id', houseId)
      .eq('is_active', true)
      .in('resident_role', ['co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor']);

    if (cascadeError) {
      console.error('[moveOutLandlord] Error removing secondary residents:', cascadeError);
      // Don't fail the whole operation, but log it
    }
  }

  // 3. Update house occupancy status (house becomes vacant/unoccupied)
  await supabase
    .from('houses')
    .update({ is_occupied: false })
    .eq('id', houseId);

  // 4. Record in ownership history (using admin client to ensure insert succeeds)
  try {
    // Record the role change for the landlord
    await adminClient
      .from('house_ownership_history')
      .insert({
        house_id: houseId,
        resident_id: residentId,
        resident_role: 'non_resident_landlord' as ResidentRole,
        event_type: 'role_change',
        previous_role: 'resident_landlord' as ResidentRole,
        event_date: today,
        notes: notes || 'Owner-Occupier moved out, converted to Property Owner',
        is_current: true,
        created_by: user.id,
      });

    // Record move_out events for each secondary resident
    if (secondaryResidents && secondaryResidents.length > 0) {
      const historyRecords = secondaryResidents.map(sr => ({
        house_id: houseId,
        resident_id: sr.resident_id,
        resident_role: 'co_resident' as ResidentRole, // Generic, actual role will be in the record
        event_type: 'move_out' as const,
        event_date: today,
        notes: 'Removed due to Owner-Occupier move-out',
        is_current: false,
        created_by: user.id,
      }));

      await adminClient
        .from('house_ownership_history')
        .insert(historyRecords);
    }
  } catch (historyError) {
    console.error('[moveOutLandlord] Error recording history:', historyError);
    // Don't fail the operation for history errors
  }

  // Revalidate paths
  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);
  revalidatePath('/residents');
  revalidatePath(`/residents/${residentId}`);

  return {
    success: true,
    error: null,
    movedOutResidents: secondaryCount
  };
}
