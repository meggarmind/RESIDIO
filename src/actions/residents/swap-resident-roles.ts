'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ResidentRole } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';

type SwapResidentRolesResponse = {
  success: boolean;
  error: string | null;
}

/**
 * Swap roles between a co_resident and the current primary residing resident (Tenant or Resident Landlord).
 *
 * This implements the "Promote" feature:
 * - The co_resident is promoted to the primary role (tenant or resident_landlord)
 * - The former primary resident is demoted to co_resident
 * - Other secondary residents' sponsors are updated to point to the new primary
 *
 * Use case: When a primary resident is leaving but a co_resident will take over.
 *
 * Business Rules:
 * - Only co_resident can be promoted (not household_member, domestic_staff, caretaker)
 * - The demoted resident becomes a co_resident
 * - Both residents must be actively assigned to the same house
 * - After swap, the new primary becomes the sponsor for any roles that require one
 */
export async function swapResidentRoles(
  houseId: string,
  promoteResidentId: string,  // co_resident being promoted
  demoteResidentId: string    // tenant/resident_landlord being demoted
): Promise<SwapResidentRolesResponse> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  if (!houseId || !promoteResidentId || !demoteResidentId) {
    return { success: false, error: 'House ID, promote resident ID, and demote resident ID are all required' };
  }

  if (promoteResidentId === demoteResidentId) {
    return { success: false, error: 'Cannot swap a resident with themselves' };
  }

  const today = new Date().toISOString().split('T')[0];

  // Get the co_resident's assignment (to be promoted)
  const { data: promoteAssignment, error: promoteError } = await supabase
    .from('resident_houses')
    .select('id, resident_role, resident_id')
    .eq('resident_id', promoteResidentId)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .single();

  if (promoteError || !promoteAssignment) {
    return { success: false, error: 'Resident to promote is not assigned to this house' };
  }

  if (promoteAssignment.resident_role !== 'co_resident') {
    return {
      success: false,
      error: `Only Co-Residents can be promoted. This resident is a ${RESIDENT_ROLE_LABELS[promoteAssignment.resident_role as ResidentRole]}.`
    };
  }

  // Get the primary resident's assignment (to be demoted)
  const { data: demoteAssignment, error: demoteError } = await supabase
    .from('resident_houses')
    .select('id, resident_role, resident_id')
    .eq('resident_id', demoteResidentId)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .single();

  if (demoteError || !demoteAssignment) {
    return { success: false, error: 'Resident to demote is not assigned to this house' };
  }

  const demoteRole = demoteAssignment.resident_role as ResidentRole;
  if (demoteRole !== 'tenant' && demoteRole !== 'resident_landlord') {
    return {
      success: false,
      error: `Can only swap with a Renter or Owner-Occupier. This resident is a ${RESIDENT_ROLE_LABELS[demoteRole]}.`
    };
  }

  // Perform the swap
  // 1. Update the co_resident to become the primary role
  const { error: promoteUpdateError } = await supabase
    .from('resident_houses')
    .update({
      resident_role: demoteRole, // Take the primary's role
      sponsor_resident_id: null,  // Primary doesn't have a sponsor
    })
    .eq('id', promoteAssignment.id);

  if (promoteUpdateError) {
    console.error('[swapResidentRoles] Error promoting resident:', promoteUpdateError);
    return { success: false, error: 'Failed to promote resident' };
  }

  // 2. Update the primary resident to become co_resident
  const { error: demoteUpdateError } = await supabase
    .from('resident_houses')
    .update({
      resident_role: 'co_resident' as ResidentRole,
      sponsor_resident_id: promoteResidentId, // New primary is now their sponsor
    })
    .eq('id', demoteAssignment.id);

  if (demoteUpdateError) {
    console.error('[swapResidentRoles] Error demoting resident:', demoteUpdateError);
    // Try to rollback the promotion
    await supabase
      .from('resident_houses')
      .update({
        resident_role: 'co_resident' as ResidentRole,
        sponsor_resident_id: demoteResidentId,
      })
      .eq('id', promoteAssignment.id);
    return { success: false, error: 'Failed to demote resident' };
  }

  // 3. Update sponsors for any other secondary residents (domestic_staff, caretaker)
  // They should now point to the new primary
  const { error: sponsorUpdateError } = await supabase
    .from('resident_houses')
    .update({ sponsor_resident_id: promoteResidentId })
    .eq('house_id', houseId)
    .eq('is_active', true)
    .eq('sponsor_resident_id', demoteResidentId) // Only update those who had the old primary as sponsor
    .in('resident_role', ['domestic_staff', 'caretaker']);

  if (sponsorUpdateError) {
    console.error('[swapResidentRoles] Error updating sponsors:', sponsorUpdateError);
    // Don't fail for this - it's a cleanup step
  }

  // Record history for the swap
  try {
    // Get resident names for history notes
    const { data: residents } = await adminClient
      .from('residents')
      .select('id, first_name, last_name')
      .in('id', [promoteResidentId, demoteResidentId]);

    const promoteResident = residents?.find(r => r.id === promoteResidentId);
    const demoteResident = residents?.find(r => r.id === demoteResidentId);
    const promoteName = promoteResident ? `${promoteResident.first_name} ${promoteResident.last_name}` : 'Resident';
    const demoteName = demoteResident ? `${demoteResident.first_name} ${demoteResident.last_name}` : 'Resident';

    // Record promotion
    await adminClient
      .from('house_ownership_history')
      .insert({
        house_id: houseId,
        resident_id: promoteResidentId,
        resident_role: demoteRole,
        event_type: 'role_change',
        previous_role: 'co_resident' as ResidentRole,
        event_date: today,
        notes: `Promoted from Co-Resident to ${RESIDENT_ROLE_LABELS[demoteRole]} (swapped with ${demoteName})`,
        is_current: demoteRole === 'resident_landlord', // Mark as current owner if landlord
        created_by: user.id,
      });

    // Record demotion
    await adminClient
      .from('house_ownership_history')
      .insert({
        house_id: houseId,
        resident_id: demoteResidentId,
        resident_role: 'co_resident' as ResidentRole,
        event_type: 'role_change',
        previous_role: demoteRole,
        event_date: today,
        notes: `Demoted from ${RESIDENT_ROLE_LABELS[demoteRole]} to Co-Resident (swapped with ${promoteName})`,
        is_current: false,
        created_by: user.id,
      });
  } catch (historyError) {
    console.error('[swapResidentRoles] Error recording history:', historyError);
    // Don't fail the operation for history errors
  }

  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);
  revalidatePath('/residents');
  revalidatePath(`/residents/${promoteResidentId}`);
  revalidatePath(`/residents/${demoteResidentId}`);

  return { success: true, error: null };
}
