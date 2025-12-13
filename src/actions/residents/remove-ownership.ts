'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ResidentRole } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';

export interface RemoveOwnershipResponse {
  success: boolean;
  error: string | null;
}

/**
 * Remove ownership from a non-resident landlord or developer without transferring to a new owner.
 *
 * This makes the house vacant (no owner assigned).
 *
 * Business Rules:
 * - Only non_resident_landlord and developer can have ownership removed
 * - If a tenant exists, they must be removed first
 * - All secondary residents must be removed first (or will be cascade removed)
 * - House becomes completely vacant after removal
 * - Full history is recorded in house_ownership_history
 */
export async function removeOwnership(
  houseId: string,
  ownerId: string,
  removalDate?: string,
  notes?: string
): Promise<RemoveOwnershipResponse> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  if (!houseId || !ownerId) {
    return { success: false, error: 'House ID and owner ID are required' };
  }

  const today = removalDate || new Date().toISOString().split('T')[0];

  // Verify owner is assigned to this house with an ownership role
  const { data: ownerAssignment, error: assignmentError } = await supabase
    .from('resident_houses')
    .select('id, resident_role')
    .eq('resident_id', ownerId)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .single();

  if (assignmentError || !ownerAssignment) {
    return { success: false, error: 'Owner is not currently assigned to this house' };
  }

  const ownerRole = ownerAssignment.resident_role as ResidentRole;
  if (ownerRole !== 'non_resident_landlord' && ownerRole !== 'developer') {
    return {
      success: false,
      error: `Only Non-Resident Landlord or Developer ownership can be removed. Current role is ${RESIDENT_ROLE_LABELS[ownerRole]}.`
    };
  }

  // Check if there are any other active residents (tenant, secondary residents)
  const { data: otherResidents, error: othersError } = await supabase
    .from('resident_houses')
    .select('id, resident_id, resident_role')
    .eq('house_id', houseId)
    .eq('is_active', true)
    .neq('resident_id', ownerId);

  if (othersError) {
    console.error('[removeOwnership] Error checking other residents:', othersError);
    return { success: false, error: 'Failed to check for other residents' };
  }

  // If there are tenants, they must be removed first
  const tenant = otherResidents?.find(r => r.resident_role === 'tenant');
  if (tenant) {
    return {
      success: false,
      error: 'Cannot remove ownership while a tenant is assigned. Remove the tenant first.'
    };
  }

  // Get owner name for history
  const { data: owner } = await adminClient
    .from('residents')
    .select('first_name, last_name, entity_type, company_name')
    .eq('id', ownerId)
    .single();

  const ownerName = owner
    ? (owner.entity_type === 'corporate' && owner.company_name
        ? owner.company_name
        : `${owner.first_name} ${owner.last_name}`)
    : 'Owner';

  // Step 1: Remove any secondary residents (cascade removal)
  const secondaryResidents = otherResidents?.filter(r =>
    ['co_resident', 'household_member', 'domestic_staff', 'caretaker'].includes(r.resident_role)
  ) || [];

  if (secondaryResidents.length > 0) {
    const { error: cascadeError } = await supabase
      .from('resident_houses')
      .update({
        is_active: false,
        move_out_date: today,
      })
      .eq('house_id', houseId)
      .eq('is_active', true)
      .in('resident_role', ['co_resident', 'household_member', 'domestic_staff', 'caretaker']);

    if (cascadeError) {
      console.error('[removeOwnership] Error removing secondary residents:', cascadeError);
      return { success: false, error: 'Failed to remove secondary residents' };
    }

    // Record move_out history for each secondary resident
    try {
      const historyRecords = secondaryResidents.map(sr => ({
        house_id: houseId,
        resident_id: sr.resident_id,
        resident_role: sr.resident_role as ResidentRole,
        event_type: 'move_out' as const,
        event_date: today,
        notes: 'Removed due to ownership removal',
        is_current: false,
        created_by: user.id,
      }));

      await adminClient
        .from('house_ownership_history')
        .insert(historyRecords);
    } catch (historyError) {
      console.error('[removeOwnership] Error recording secondary history:', historyError);
      // Don't fail for history errors
    }
  }

  // Step 2: Deactivate the owner's assignment
  const { error: deactivateError } = await supabase
    .from('resident_houses')
    .update({
      is_active: false,
      move_out_date: today,
    })
    .eq('id', ownerAssignment.id);

  if (deactivateError) {
    console.error('[removeOwnership] Error deactivating owner:', deactivateError);
    return { success: false, error: 'Failed to remove owner assignment' };
  }

  // Step 3: Update house occupancy
  await supabase
    .from('houses')
    .update({ is_occupied: false })
    .eq('id', houseId);

  // Step 4: Record ownership history
  try {
    // Clear any existing "is_current" flags for this owner at this house
    await adminClient
      .from('house_ownership_history')
      .update({ is_current: false })
      .eq('house_id', houseId)
      .eq('resident_id', ownerId)
      .eq('is_current', true);

    // Record ownership end
    await adminClient
      .from('house_ownership_history')
      .insert({
        house_id: houseId,
        resident_id: ownerId,
        resident_role: ownerRole,
        event_type: 'ownership_end',
        event_date: today,
        notes: notes || `${ownerName} ownership removed. House is now vacant.`,
        is_current: false,
        created_by: user.id,
      });
  } catch (historyError) {
    console.error('[removeOwnership] Error recording history:', historyError);
    // Don't fail for history errors
  }

  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);
  revalidatePath('/residents');
  revalidatePath(`/residents/${ownerId}`);

  return { success: true, error: null };
}
