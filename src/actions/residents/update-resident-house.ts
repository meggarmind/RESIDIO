'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ResidentRole, ResidentHouse } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';
import { requiresSponsor } from '@/lib/validators/resident';

type UpdateResidentHouseData = {
  resident_role?: ResidentRole;
  sponsor_resident_id?: string | null;
  is_billing_responsible?: boolean;
}

type UpdateResidentHouseResponse = {
  data: ResidentHouse | null;
  error: string | null;
}

// Secondary roles that can be edited between each other
const EDITABLE_SECONDARY_ROLES: ResidentRole[] = ['co_resident', 'household_member', 'domestic_staff', 'caretaker'];

/**
 * Update a resident's house assignment (role, sponsor, billing responsibility)
 *
 * Business Rules:
 * - Only secondary roles can be edited (co_resident, household_member, domestic_staff, caretaker)
 * - Primary roles (resident_landlord, non_resident_landlord, tenant, developer) cannot be changed via edit
 * - For role swap (promote), use the swapResidentRoles action instead
 * - Sponsor is required for domestic_staff and caretaker roles
 */
export async function updateResidentHouse(
  residentId: string,
  houseId: string,
  data: UpdateResidentHouseData
): Promise<UpdateResidentHouseResponse> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  if (!residentId || !houseId) {
    return { data: null, error: 'Resident ID and House ID are required' };
  }

  // Get the current assignment
  const { data: assignment, error: assignmentError } = await supabase
    .from('resident_houses')
    .select('id, resident_role, sponsor_resident_id, is_billing_responsible')
    .eq('resident_id', residentId)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .single();

  if (assignmentError || !assignment) {
    return { data: null, error: 'Resident is not currently assigned to this house' };
  }

  const currentRole = assignment.resident_role as ResidentRole;

  // Check if the current role is editable (secondary roles only)
  if (!EDITABLE_SECONDARY_ROLES.includes(currentRole)) {
    return {
      data: null,
      error: `${RESIDENT_ROLE_LABELS[currentRole]} assignments cannot be edited. Use specific actions for primary roles.`
    };
  }

  // If changing role, validate the new role
  if (data.resident_role && data.resident_role !== currentRole) {
    const newRole = data.resident_role;

    // New role must also be a secondary role
    if (!EDITABLE_SECONDARY_ROLES.includes(newRole)) {
      return {
        data: null,
        error: `Cannot change from ${RESIDENT_ROLE_LABELS[currentRole]} to ${RESIDENT_ROLE_LABELS[newRole]}. Only secondary roles can be edited.`
      };
    }

    // Validate sponsor requirement for the new role
    if (requiresSponsor(newRole)) {
      const sponsorId = data.sponsor_resident_id ?? assignment.sponsor_resident_id;
      if (!sponsorId) {
        return {
          data: null,
          error: `${RESIDENT_ROLE_LABELS[newRole]} must have a sponsor. Please select a sponsor.`
        };
      }

      // Verify sponsor is a primary resident of the same house
      const { data: sponsorAssignment } = await supabase
        .from('resident_houses')
        .select('id, resident_role')
        .eq('resident_id', sponsorId)
        .eq('house_id', houseId)
        .eq('is_active', true)
        .in('resident_role', ['non_resident_landlord', 'resident_landlord', 'tenant'])
        .single();

      if (!sponsorAssignment) {
        return {
          data: null,
          error: 'Sponsor must be a Resident Landlord, Non-Resident Landlord, or Tenant of the same house.'
        };
      }
    }
  }

  // If not changing role but role requires sponsor, validate sponsor
  if (!data.resident_role && requiresSponsor(currentRole) && data.sponsor_resident_id !== undefined) {
    if (!data.sponsor_resident_id) {
      return {
        data: null,
        error: `${RESIDENT_ROLE_LABELS[currentRole]} must have a sponsor.`
      };
    }

    // Verify sponsor is a primary resident of the same house
    const { data: sponsorAssignment } = await supabase
      .from('resident_houses')
      .select('id, resident_role')
      .eq('resident_id', data.sponsor_resident_id)
      .eq('house_id', houseId)
      .eq('is_active', true)
      .in('resident_role', ['non_resident_landlord', 'resident_landlord', 'tenant'])
      .single();

    if (!sponsorAssignment) {
      return {
        data: null,
        error: 'Sponsor must be a Resident Landlord, Non-Resident Landlord, or Tenant of the same house.'
      };
    }
  }

  // Build update object
  const updateData: Partial<ResidentHouse> = {};

  if (data.resident_role !== undefined) {
    updateData.resident_role = data.resident_role;
  }
  if (data.sponsor_resident_id !== undefined) {
    updateData.sponsor_resident_id = data.sponsor_resident_id;
  }

  // Perform the update
  const { data: updated, error: updateError } = await supabase
    .from('resident_houses')
    .update(updateData)
    .eq('id', assignment.id)
    .select()
    .single();

  if (updateError) {
    console.error('[updateResidentHouse] Update error:', updateError);
    return { data: null, error: updateError.message };
  }

  // Record role change in history if role changed
  if (data.resident_role && data.resident_role !== currentRole) {
    try {
      await adminClient
        .from('house_ownership_history')
        .insert({
          house_id: houseId,
          resident_id: residentId,
          resident_role: data.resident_role,
          event_type: 'role_change',
          previous_role: currentRole,
          event_date: new Date().toISOString().split('T')[0],
          notes: `Role changed from ${RESIDENT_ROLE_LABELS[currentRole]} to ${RESIDENT_ROLE_LABELS[data.resident_role]}`,
          is_current: false,
          created_by: user.id,
        });
    } catch (historyError) {
      console.error('[updateResidentHouse] Error recording history:', historyError);
      // Don't fail the operation for history errors
    }
  }

  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);
  revalidatePath('/residents');
  revalidatePath(`/residents/${residentId}`);

  return { data: updated, error: null };
}
