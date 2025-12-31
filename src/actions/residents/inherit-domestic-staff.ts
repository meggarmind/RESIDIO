'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ResidentRole } from '@/types/database';

/**
 * Inheritable staff member info
 */
export type InheritableStaff = {
  assignment_id: string;
  resident_id: string;
  first_name: string;
  last_name: string;
  phone_primary: string;
  resident_role: ResidentRole;
  is_live_in: boolean;
  tags: string[];
  previous_sponsor_id: string;
  previous_sponsor_name: string;
};

type GetInheritableStaffResponse = {
  success: boolean;
  error: string | null;
  data?: InheritableStaff[];
};

type InheritStaffResponse = {
  success: boolean;
  error: string | null;
  inherited?: number;
  declined?: number;
};

/**
 * Get domestic staff and contractors that can be inherited by a new tenant
 *
 * When a new tenant moves into a property that had previous tenants/landlords,
 * they may want to inherit existing domestic staff (live-in or visiting) who
 * were previously sponsored by the outgoing resident.
 *
 * This returns staff who:
 * 1. Were previously active at this house
 * 2. Had a sponsor who has since moved out
 * 3. Are in roles that can be inherited (domestic_staff, caretaker, contractor)
 */
export async function getInheritableStaff(
  houseId: string,
  newTenantResidentId: string
): Promise<GetInheritableStaffResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Verify the new tenant is actually assigned to this house as a primary resident
  const { data: tenantAssignment, error: tenantError } = await supabase
    .from('resident_houses')
    .select('id, resident_role')
    .eq('resident_id', newTenantResidentId)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .in('resident_role', ['resident_landlord', 'tenant'])
    .single();

  if (tenantError || !tenantAssignment) {
    return {
      success: false,
      error: 'You must be a tenant or resident landlord at this property to inherit staff',
    };
  }

  // Get recently inactive staff assignments that could be inherited
  // These are staff who were removed due to sponsor departure within the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: inactiveStaff, error: staffError } = await supabase
    .from('resident_houses')
    .select(`
      id,
      resident_id,
      resident_role,
      is_live_in,
      tags,
      sponsor_resident_id,
      move_out_date,
      residents!inner(
        id,
        first_name,
        last_name,
        phone_primary
      )
    `)
    .eq('house_id', houseId)
    .eq('is_active', false)
    .in('resident_role', ['domestic_staff', 'caretaker', 'contractor'])
    .gte('move_out_date', thirtyDaysAgo.toISOString().split('T')[0])
    .not('sponsor_resident_id', 'is', null);

  if (staffError) {
    console.error('[getInheritableStaff] Error:', staffError);
    return { success: false, error: 'Failed to fetch inheritable staff' };
  }

  if (!inactiveStaff || inactiveStaff.length === 0) {
    return { success: true, error: null, data: [] };
  }

  // Get previous sponsor names
  const sponsorIds = [...new Set(inactiveStaff.map(s => s.sponsor_resident_id).filter(Boolean))];
  const { data: sponsors } = await supabase
    .from('residents')
    .select('id, first_name, last_name')
    .in('id', sponsorIds);

  const sponsorMap = new Map(
    (sponsors || []).map(s => [s.id, `${s.first_name} ${s.last_name}`])
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inheritableStaff: InheritableStaff[] = inactiveStaff.map((s: any) => {
    // Supabase returns joined data as objects when using !inner
    const resident = s.residents;
    return {
      assignment_id: s.id,
      resident_id: s.resident_id,
      first_name: resident?.first_name || '',
      last_name: resident?.last_name || '',
      phone_primary: resident?.phone_primary || '',
      resident_role: s.resident_role as ResidentRole,
      is_live_in: s.is_live_in ?? false,
      tags: s.tags || [],
      previous_sponsor_id: s.sponsor_resident_id || '',
      previous_sponsor_name: sponsorMap.get(s.sponsor_resident_id || '') || 'Unknown',
    };
  });

  return { success: true, error: null, data: inheritableStaff };
}

/**
 * Inherit selected domestic staff from previous tenants
 *
 * This reactivates the selected staff members and assigns them to the new sponsor.
 * It creates a new assignment rather than reactivating the old one to maintain
 * proper history.
 */
export async function inheritDomesticStaff(
  houseId: string,
  newSponsorResidentId: string,
  staffAssignmentIds: string[],
  moveInDate?: string
): Promise<InheritStaffResponse> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  if (staffAssignmentIds.length === 0) {
    return { success: true, error: null, inherited: 0, declined: 0 };
  }

  const today = moveInDate || new Date().toISOString().split('T')[0];

  // Verify the new sponsor is a primary resident at this house
  const { data: sponsorAssignment, error: sponsorError } = await supabase
    .from('resident_houses')
    .select('id, resident_role')
    .eq('resident_id', newSponsorResidentId)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .in('resident_role', ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'])
    .single();

  if (sponsorError || !sponsorAssignment) {
    return {
      success: false,
      error: 'New sponsor must be a primary resident at this property',
    };
  }

  // Get the old assignments to inherit from
  const { data: oldAssignments, error: fetchError } = await supabase
    .from('resident_houses')
    .select('id, resident_id, resident_role, is_live_in, tags')
    .eq('house_id', houseId)
    .eq('is_active', false)
    .in('id', staffAssignmentIds);

  if (fetchError || !oldAssignments) {
    return { success: false, error: 'Failed to fetch staff assignments' };
  }

  let inherited = 0;

  for (const oldAssignment of oldAssignments) {
    // Check if this resident already has an active assignment at this house
    const { data: existingActive } = await supabase
      .from('resident_houses')
      .select('id')
      .eq('resident_id', oldAssignment.resident_id)
      .eq('house_id', houseId)
      .eq('is_active', true)
      .single();

    if (existingActive) {
      // Already active, skip
      console.log(`[inheritDomesticStaff] Resident ${oldAssignment.resident_id} already active at house ${houseId}`);
      continue;
    }

    // Create a new assignment with the new sponsor
    const { error: insertError } = await supabase
      .from('resident_houses')
      .insert({
        resident_id: oldAssignment.resident_id,
        house_id: houseId,
        resident_role: oldAssignment.resident_role,
        sponsor_resident_id: newSponsorResidentId,
        move_in_date: today,
        is_active: true,
        is_live_in: oldAssignment.is_live_in ?? false,
        tags: oldAssignment.tags || [],
        created_by: user.id,
      });

    if (insertError) {
      console.error('[inheritDomesticStaff] Insert error:', insertError);
      continue;
    }

    // Record in history
    try {
      await adminClient.from('house_ownership_history').insert({
        house_id: houseId,
        resident_id: oldAssignment.resident_id,
        resident_role: oldAssignment.resident_role as ResidentRole,
        event_type: 'move_in',
        event_date: today,
        notes: 'Inherited by new tenant from previous occupant',
        is_current: true,
        created_by: user.id,
      });
    } catch (historyError) {
      console.error('[inheritDomesticStaff] History error:', historyError);
    }

    inherited++;
  }

  const declined = staffAssignmentIds.length - inherited;

  // Revalidate paths
  revalidatePath('/residents');
  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);

  return {
    success: true,
    error: null,
    inherited,
    declined,
  };
}

/**
 * Decline inheriting domestic staff
 *
 * This marks the old assignments as permanently declined so they don't show up
 * as inheritable again.
 */
export async function declineInheritance(
  houseId: string,
  staffAssignmentIds: string[]
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  if (staffAssignmentIds.length === 0) {
    return { success: true, error: null };
  }

  // Add a tag to mark as declined inheritance
  // This prevents them from showing up again
  const { error } = await supabase
    .from('resident_houses')
    .update({
      tags: supabase.rpc('array_append_unique', { arr: [], new_element: 'inheritance_declined' }),
    })
    .eq('house_id', houseId)
    .eq('is_active', false)
    .in('id', staffAssignmentIds);

  // If RPC doesn't exist, try a simpler approach
  if (error) {
    // Fallback: just update the move_out_date to be older than 30 days
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);

    const { error: fallbackError } = await supabase
      .from('resident_houses')
      .update({
        move_out_date: oldDate.toISOString().split('T')[0],
      })
      .eq('house_id', houseId)
      .eq('is_active', false)
      .in('id', staffAssignmentIds);

    if (fallbackError) {
      console.error('[declineInheritance] Error:', fallbackError);
      return { success: false, error: 'Failed to decline inheritance' };
    }
  }

  return { success: true, error: null };
}
