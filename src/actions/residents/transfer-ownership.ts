'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ResidentRole } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

type TransferOwnershipResponse = {
  success: boolean;
  error: string | null;
}

/**
 * Transfer property ownership from one owner to another.
 *
 * This handles ownership changes for Non-Resident Landlords and Developers:
 * - The current owner's assignment is deactivated
 * - A new owner's assignment is created/activated
 * - Full history is recorded in house_ownership_history
 * - Existing tenant (if any) remains with the new owner
 *
 * Business Rules:
 * - Only non_resident_landlord and developer can use ownership transfer
 * - New owner role must be non_resident_landlord or developer
 * - Existing tenant inherits new landlord (tenant stays)
 * - Secondary residents of tenant also remain
 */
export async function transferOwnership(
  houseId: string,
  currentOwnerId: string,
  newOwnerId: string,
  newOwnerRole: 'non_resident_landlord' | 'developer',
  transferDate?: string,
  transferNotes?: string
): Promise<TransferOwnershipResponse> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Permission check
  const auth = await authorizePermission(PERMISSIONS.HOUSES_UPDATE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  if (!houseId || !currentOwnerId || !newOwnerId) {
    return { success: false, error: 'House ID, current owner ID, and new owner ID are all required' };
  }

  if (currentOwnerId === newOwnerId) {
    return { success: false, error: 'New owner must be different from current owner' };
  }

  if (newOwnerRole !== 'non_resident_landlord' && newOwnerRole !== 'developer') {
    return { success: false, error: 'New owner role must be Property Owner or Developer' };
  }

  const today = transferDate || new Date().toISOString().split('T')[0];

  // Verify current owner is an owner at this house
  const { data: currentAssignment, error: currentError } = await supabase
    .from('resident_houses')
    .select('id, resident_role')
    .eq('resident_id', currentOwnerId)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .single();

  if (currentError || !currentAssignment) {
    return { success: false, error: 'Current owner is not assigned to this house' };
  }

  const currentRole = currentAssignment.resident_role as ResidentRole;
  if (currentRole !== 'non_resident_landlord' && currentRole !== 'developer') {
    return {
      success: false,
      error: `Only Non-Resident Landlord or Developer can transfer ownership. Current role is ${RESIDENT_ROLE_LABELS[currentRole]}.`
    };
  }

  // Verify new owner exists
  const { data: newOwner, error: newOwnerError } = await adminClient
    .from('residents')
    .select('id, first_name, last_name, entity_type')
    .eq('id', newOwnerId)
    .single();

  if (newOwnerError || !newOwner) {
    return { success: false, error: 'New owner not found' };
  }

  // Verify corporate entities can only be non_resident_landlord or developer
  if (newOwner.entity_type === 'corporate' && newOwnerRole !== 'non_resident_landlord' && newOwnerRole !== 'developer') {
    return { success: false, error: 'Corporate entities can only be Property Owner or Developer' };
  }

  // Check if new owner already has an assignment at this house
  const { data: existingAssignment } = await supabase
    .from('resident_houses')
    .select('id, is_active, resident_role')
    .eq('resident_id', newOwnerId)
    .eq('house_id', houseId)
    .single();

  // Get current owner name for history notes
  const { data: currentOwner } = await adminClient
    .from('residents')
    .select('first_name, last_name')
    .eq('id', currentOwnerId)
    .single();

  const currentOwnerName = currentOwner ? `${currentOwner.first_name} ${currentOwner.last_name}` : 'Previous Owner';
  const newOwnerName = `${newOwner.first_name} ${newOwner.last_name}`;

  // Step 1: Deactivate current owner's assignment
  const { error: deactivateError } = await supabase
    .from('resident_houses')
    .update({
      is_active: false,
      move_out_date: today,
    })
    .eq('id', currentAssignment.id);

  if (deactivateError) {
    console.error('[transferOwnership] Error deactivating current owner:', deactivateError);
    return { success: false, error: 'Failed to deactivate current owner assignment' };
  }

  // Step 2: Create/activate new owner's assignment
  if (existingAssignment) {
    // Reactivate existing assignment with new role
    const { error: reactivateError } = await supabase
      .from('resident_houses')
      .update({
        is_active: true,
        resident_role: newOwnerRole,
        move_in_date: today,
        move_out_date: null,
      })
      .eq('id', existingAssignment.id);

    if (reactivateError) {
      console.error('[transferOwnership] Error reactivating new owner:', reactivateError);
      // Try to rollback
      await supabase
        .from('resident_houses')
        .update({ is_active: true, move_out_date: null })
        .eq('id', currentAssignment.id);
      return { success: false, error: 'Failed to activate new owner assignment' };
    }
  } else {
    // Create new assignment
    const { error: createError } = await supabase
      .from('resident_houses')
      .insert({
        resident_id: newOwnerId,
        house_id: houseId,
        resident_role: newOwnerRole,
        move_in_date: today,
        is_active: true,
        created_by: user.id,
      });

    if (createError) {
      console.error('[transferOwnership] Error creating new owner assignment:', createError);
      // Try to rollback
      await supabase
        .from('resident_houses')
        .update({ is_active: true, move_out_date: null })
        .eq('id', currentAssignment.id);
      return { success: false, error: 'Failed to create new owner assignment' };
    }
  }

  // Step 3: Record ownership history
  try {
    const notes = transferNotes || `Ownership transferred from ${currentOwnerName} to ${newOwnerName}`;

    // Record ownership end for current owner
    await adminClient
      .from('house_ownership_history')
      .insert({
        house_id: houseId,
        resident_id: currentOwnerId,
        resident_role: currentRole,
        event_type: 'ownership_end',
        event_date: today,
        notes: `Transferred ownership to ${newOwnerName}. ${transferNotes || ''}`.trim(),
        is_current: false,
        created_by: user.id,
      });

    // Clear any existing "is_current" flags for ownership at this house
    await adminClient
      .from('house_ownership_history')
      .update({ is_current: false })
      .eq('house_id', houseId)
      .eq('is_current', true)
      .in('resident_role', ['resident_landlord', 'non_resident_landlord', 'developer']);

    // Record ownership transfer to new owner
    await adminClient
      .from('house_ownership_history')
      .insert({
        house_id: houseId,
        resident_id: newOwnerId,
        resident_role: newOwnerRole,
        event_type: 'ownership_transfer',
        event_date: today,
        notes: `Received ownership from ${currentOwnerName}. ${transferNotes || ''}`.trim(),
        is_current: true,
        created_by: user.id,
      });
  } catch (historyError) {
    console.error('[transferOwnership] Error recording history:', historyError);
    // Don't fail the operation for history errors
  }

  // Audit log
  await logAudit({
    action: 'TRANSFER',
    entityType: 'houses',
    entityId: houseId,
    entityDisplay: `Ownership transfer: ${currentOwnerName} → ${newOwnerName}`,
    oldValues: { owner_id: currentOwnerId, owner_name: currentOwnerName, owner_role: currentRole },
    newValues: { owner_id: newOwnerId, owner_name: newOwnerName, owner_role: newOwnerRole, transfer_date: today },
    description: transferNotes || `Property ownership transferred from ${currentOwnerName} to ${newOwnerName}`,
  });

  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);
  revalidatePath('/residents');
  revalidatePath(`/residents/${currentOwnerId}`);
  revalidatePath(`/residents/${newOwnerId}`);

  return { success: true, error: null };
}
