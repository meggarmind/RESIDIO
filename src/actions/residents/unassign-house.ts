'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ResidentRole } from '@/types/database';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

type UnassignHouseResponse = {
  success: boolean;
  error: string | null;
  cascadeRemovedCount?: number; // Count of secondary residents also removed (for tenant removal)
}

/**
 * Unassign a resident from a house
 *
 * Business Rules:
 * - resident_landlord: CANNOT be unassigned (use moveOutLandlord instead)
 * - non_resident_landlord: CANNOT be unassigned (use transferOwnership instead)
 * - developer: CANNOT be unassigned (use transferOwnership instead)
 * - tenant: CAN be unassigned, CASCADES to remove all secondary residents
 * - secondary roles: CAN be unassigned (simple removal)
 *
 * When a tenant is removed:
 * 1. All secondary residents (co_resident, household_member, domestic_staff, caretaker) are also removed
 * 2. Non-resident landlord (if exists) remains
 * 3. House state becomes "Vacant - Landlord assigned" or "Vacant"
 */
export async function unassignHouse(
  residentId: string,
  houseId: string,
  moveOutDate?: string,
  notes?: string
): Promise<UnassignHouseResponse> {
  // Permission check
  const auth = await authorizePermission(PERMISSIONS.HOUSES_ASSIGN_RESIDENT);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

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

  // Get the current assignment to check the role
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

  const role = assignment.resident_role as ResidentRole;

  // Block removal of ownership roles
  if (role === 'resident_landlord') {
    return {
      success: false,
      error: 'Owner-Occupiers cannot be removed. Use "Move Out" to convert to Property Owner.'
    };
  }

  if (role === 'non_resident_landlord' || role === 'developer') {
    return {
      success: false,
      error: 'Owners cannot be removed. Use "Transfer Ownership" to transfer to a new owner.'
    };
  }

  let cascadeRemovedCount = 0;

  // Handle tenant removal with cascade
  if (role === 'tenant') {
    // Get all secondary residents to cascade remove (includes contractor added in Phase 15)
    const { data: secondaryResidents, error: secondaryError } = await supabase
      .from('resident_houses')
      .select('id, resident_id, resident_role')
      .eq('house_id', houseId)
      .eq('is_active', true)
      .in('resident_role', ['co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor']);

    if (secondaryError) {
      console.error('[unassignHouse] Error fetching secondary residents:', secondaryError);
      return { success: false, error: 'Failed to check secondary residents' };
    }

    cascadeRemovedCount = secondaryResidents?.length || 0;

    // Cascade: Deactivate all secondary residents (includes contractor added in Phase 15)
    if (cascadeRemovedCount > 0) {
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
        console.error('[unassignHouse] Error cascading removal:', cascadeError);
        return { success: false, error: 'Failed to remove secondary residents' };
      }

      // Record move_out history for each secondary resident
      try {
        const historyRecords = secondaryResidents!.map(sr => ({
          house_id: houseId,
          resident_id: sr.resident_id,
          resident_role: sr.resident_role as ResidentRole,
          event_type: 'move_out' as const,
          event_date: today,
          notes: 'Removed due to Tenant move-out',
          is_current: false,
          created_by: user.id,
        }));

        await adminClient
          .from('house_ownership_history')
          .insert(historyRecords);
      } catch (historyError) {
        console.error('[unassignHouse] Error recording secondary history:', historyError);
        // Don't fail for history errors
      }
    }

    // Update house occupancy
    await supabase
      .from('houses')
      .update({ is_occupied: false })
      .eq('id', houseId);
  }

  // Deactivate the primary assignment (soft delete)
  const { error } = await supabase
    .from('resident_houses')
    .update({
      is_active: false,
      move_out_date: today,
    })
    .eq('resident_id', residentId)
    .eq('house_id', houseId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Record move_out history for the removed resident
  try {
    await adminClient
      .from('house_ownership_history')
      .insert({
        house_id: houseId,
        resident_id: residentId,
        resident_role: role,
        event_type: 'move_out',
        event_date: today,
        notes: notes || (role === 'tenant'
          ? `Tenant moved out${cascadeRemovedCount > 0 ? `, ${cascadeRemovedCount} secondary residents also removed` : ''}`
          : 'Resident moved out'),
        is_current: false,
        created_by: user.id,
      });
  } catch (historyError) {
    console.error('[unassignHouse] Error recording history:', historyError);
    // Don't fail for history errors
  }

  // Audit log
  await logAudit({
    action: 'UNASSIGN',
    entityType: 'resident_houses',
    entityId: assignment.id,
    entityDisplay: `Resident unassigned from house`,
    oldValues: {
      resident_id: residentId,
      house_id: houseId,
      resident_role: role,
      is_active: true,
    },
    newValues: {
      is_active: false,
      move_out_date: today,
    },
    description: role === 'tenant' && cascadeRemovedCount > 0
      ? `Tenant unassigned, cascade removed ${cascadeRemovedCount} secondary resident(s)`
      : `${role} unassigned from house`,
  });

  revalidatePath('/residents');
  revalidatePath(`/residents/${residentId}`);
  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);

  return {
    success: true,
    error: null,
    cascadeRemovedCount: role === 'tenant' ? cascadeRemovedCount : undefined
  };
}
