'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ResidentHouse, ResidentRole, Resident } from '@/types/database';
import type { HouseAssignmentData } from '@/lib/validators/resident';
import { isPrimaryRole, requiresSponsor, isResidencyRole, isValidCorporateRole } from '@/lib/validators/resident';
import { RESIDENT_ROLE_LABELS } from '@/types/database';
import { generateLeviesForHouse } from '@/actions/billing/generate-levies';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { validateHouseAssignment } from './validation';

type AssignHouseResponse = {
  data: ResidentHouse | null;
  error: string | null;
}

export async function assignHouse(residentId: string, formData: HouseAssignmentData): Promise<AssignHouseResponse> {
  // Permission check
  const auth = await authorizePermission(PERMISSIONS.HOUSES_ASSIGN_RESIDENT);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  const role = formData.resident_role as ResidentRole;
  const roleLabel = RESIDENT_ROLE_LABELS[role];

  // Validate residentId
  if (!residentId) {
    return { data: null, error: 'Resident ID is required' };
  }

  // Get resident to check entity_type for corporate role validation
  // Use admin client to bypass RLS since we already verified the user is authenticated
  const adminClient = createAdminClient();
  const { data: resident, error: residentError } = await adminClient
    .from('residents')
    .select('id, first_name, last_name')
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    // Check if resident exists at all (maybe wrong ID format or deleted)
    const { count } = await adminClient
      .from('residents')
      .select('*', { count: 'exact', head: true });

    console.error('[assignHouse] Failed to fetch resident:', {
      residentId,
      error: residentError?.message,
      errorCode: residentError?.code,
      totalResidentsInDB: count
    });
    return { data: null, error: `Resident not found (ID: ${residentId}). The resident may have been deleted.` };
  }

  // Try to get entity_type if column exists (for corporate role validation)
  // This handles databases where migration hasn't been applied yet
  let entityType: string | null = null;
  const { data: residentWithType } = await adminClient
    .from('residents')
    .select('entity_type')
    .eq('id', residentId)
    .single();

  if (residentWithType && 'entity_type' in residentWithType) {
    entityType = (residentWithType as { entity_type: string }).entity_type;
  }

  // Validate corporate role restriction (only if entity_type column exists)
  if (entityType === 'corporate' && !isValidCorporateRole(role)) {
    return {
      data: null,
      error: 'Corporate entities can only be Property Owner or Developer',
    };
  }

  // Validate assignment rules (Single Owner, Single Tenant, Occpier vs Renter)
  const validation = await validateHouseAssignment(supabase, formData.house_id, role);
  if (!validation.valid) {
    return { data: null, error: validation.error || 'Invalid assignment' };
  }

  // Validate sponsor requirement for domestic_staff and caretaker
  if (requiresSponsor(role)) {
    if (!formData.sponsor_resident_id) {
      return {
        data: null,
        error: `${roleLabel} must have a sponsor. Please select a sponsor.`,
      };
    }

    // Verify sponsor is a primary resident of the same house
    const { data: sponsorAssignment } = await supabase
      .from('resident_houses')
      .select('id, resident_role')
      .eq('resident_id', formData.sponsor_resident_id)
      .eq('house_id', formData.house_id)
      .eq('is_active', true)
      .in('resident_role', ['non_resident_landlord', 'resident_landlord', 'tenant'])
      .single();

    if (!sponsorAssignment) {
      return {
        data: null,
        error: 'Sponsor must be an Owner-Occupier, Property Owner, or Renter of the same house.',
      };
    }
  }

  // Check residency exclusivity ("One Home" policy) for residency roles
  if (isResidencyRole(role)) {
    const { data: existingResidency } = await supabase
      .from('resident_houses')
      .select('id, house_id, resident_role, house:houses(house_number)')
      .eq('resident_id', residentId)
      .in('resident_role', ['resident_landlord', 'tenant', 'co_resident'])
      .eq('is_active', true)
      .neq('house_id', formData.house_id) // Exclude current house
      .single();

    if (existingResidency) {
      const houseData = existingResidency.house as unknown as { house_number: string } | null;
      const houseNumber = houseData?.house_number || 'another unit';
      const existingRoleLabel = RESIDENT_ROLE_LABELS[existingResidency.resident_role as ResidentRole];
      return {
        data: null,
        error: `This person already resides at ${houseNumber} as ${existingRoleLabel}. A person can only physically reside in one unit at a time.`,
      };
    }
  }

  // Check if assignment already exists
  const { data: existing } = await supabase
    .from('resident_houses')
    .select('id, is_active')
    .eq('resident_id', residentId)
    .eq('house_id', formData.house_id)
    .single();

  if (existing) {
    // If it exists but is inactive, reactivate it instead of creating new
    if (!existing.is_active) {
      // Check for occupancy conflicts before reactivating
      const reactivationValidation = await validateHouseAssignment(supabase, formData.house_id, role);
      if (!reactivationValidation.valid) {
        return { data: null, error: reactivationValidation.error || 'Invalid assignment' };
      }

      const { data: reactivated, error: reactivateError } = await supabase
        .from('resident_houses')
        .update({
          is_active: true,
          resident_role: formData.resident_role,
          move_in_date: formData.move_in_date || new Date().toISOString().split('T')[0],
          move_out_date: null,
          sponsor_resident_id: formData.sponsor_resident_id || null,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (reactivateError) {
        return { data: null, error: reactivateError.message };
      }

      // Record ownership history for primary roles (reactivation)
      if (['resident_landlord', 'non_resident_landlord', 'developer', 'tenant'].includes(role)) {
        try {
          const eventType = role === 'tenant' ? 'move_in' : 'ownership_start';
          const eventDate = formData.move_in_date || new Date().toISOString().split('T')[0];

          await adminClient
            .from('house_ownership_history')
            .insert({
              house_id: formData.house_id,
              resident_id: residentId,
              resident_role: role,
              event_type: eventType,
              event_date: eventDate,
              is_current: true,
              notes: role === 'tenant' ? 'Renter moved in' : 'Ownership assignment',
              created_by: user.id,
            });
        } catch (historyError) {
          console.error('[assignHouse] Error recording history (reactivation):', historyError);
          // Don't fail for history errors
        }
      }

      revalidatePath('/residents');
      revalidatePath(`/residents/${residentId}`);
      revalidatePath('/houses');
      return { data: reactivated, error: null };
    }

    // Already active assignment
    return { data: null, error: 'Resident is already assigned to this house' };
  }

  const { data, error } = await supabase
    .from('resident_houses')
    .insert({
      resident_id: residentId,
      house_id: formData.house_id,
      resident_role: formData.resident_role,
      move_in_date: formData.move_in_date || today,
      sponsor_resident_id: formData.sponsor_resident_id || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Record ownership history for primary roles (new assignment)
  if (['resident_landlord', 'non_resident_landlord', 'developer', 'tenant'].includes(role)) {
    try {
      const eventType = role === 'tenant' ? 'move_in' : 'ownership_start';
      const eventDate = formData.move_in_date || today;

      await adminClient
        .from('house_ownership_history')
        .insert({
          house_id: formData.house_id,
          resident_id: residentId,
          resident_role: role,
          event_type: eventType,
          event_date: eventDate,
          is_current: true,
          notes: role === 'tenant' ? 'Tenant moved in' : 'Ownership assignment',
          created_by: user.id,
        });
    } catch (historyError) {
      console.error('[assignHouse] Error recording history (new assignment):', historyError);
      // Don't fail for history errors
    }

    // Generate one-time levies for the house when a primary resident is assigned
    try {
      const levyResult = await generateLeviesForHouse(formData.house_id, residentId);
      if (levyResult.generated > 0) {
        console.log(`[assignHouse] Generated ${levyResult.generated} levies for house`);
      }
    } catch (levyError) {
      console.error('[assignHouse] Error generating levies:', levyError);
      // Don't fail for levy errors
    }
  }

  // Audit log
  await logAudit({
    action: 'ASSIGN',
    entityType: 'resident_houses',
    entityId: data.id,
    entityDisplay: `${resident.first_name} ${resident.last_name} → House`,
    newValues: {
      resident_id: residentId,
      house_id: formData.house_id,
      resident_role: formData.resident_role,
      move_in_date: formData.move_in_date || new Date().toISOString().split('T')[0],
    },
    description: `Assigned ${roleLabel} to house`,
  });

  revalidatePath('/residents');
  revalidatePath(`/residents/${residentId}`);
  revalidatePath('/houses');
  revalidatePath(`/houses/${formData.house_id}`);
  revalidatePath('/billing');
  return { data, error: null };
}
