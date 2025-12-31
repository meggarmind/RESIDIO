'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ResidentRole } from '@/types/database';
import { requiresSponsor } from '@/lib/validators/resident';

/**
 * Sponsored resident info for cascade operations
 */
export type SponsoredResident = {
  id: string;
  assignment_id: string;
  resident_id: string;
  first_name: string;
  last_name: string;
  resident_role: ResidentRole;
  house_id: string;
  house_number: string;
  street_name: string;
};

/**
 * Actions that can be taken for a sponsored resident when their sponsor leaves
 */
export type SponsorCascadeAction =
  | 'remove'           // Remove from house
  | 'transfer'         // Transfer to new sponsor
  | 'keep_unsupported' // Keep without sponsor (only for roles that don't require sponsor)
  ;

export type SponsoredResidentAction = {
  assignment_id: string;
  action: SponsorCascadeAction;
  new_sponsor_id?: string; // Required if action is 'transfer'
};

type GetSponsoredResidentsResponse = {
  success: boolean;
  error: string | null;
  data?: SponsoredResident[];
};

type ProcessSponsorCascadeResponse = {
  success: boolean;
  error: string | null;
  processed?: {
    removed: number;
    transferred: number;
    kept: number;
  };
};

/**
 * Get all residents sponsored by a given resident at a specific house
 *
 * Use this to display a list of affected residents before a sponsor leaves
 */
export async function getSponsoredResidents(
  sponsorResidentId: string,
  houseId: string
): Promise<GetSponsoredResidentsResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Get all active residents sponsored by this sponsor at this house
  const { data: assignments, error } = await supabase
    .from('resident_houses')
    .select(`
      id,
      resident_id,
      resident_role,
      house_id,
      residents!inner(
        id,
        first_name,
        last_name
      ),
      houses!inner(
        id,
        house_number,
        streets(name)
      )
    `)
    .eq('sponsor_resident_id', sponsorResidentId)
    .eq('house_id', houseId)
    .eq('is_active', true);

  if (error) {
    console.error('[getSponsoredResidents] Error:', error);
    return { success: false, error: 'Failed to fetch sponsored residents' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sponsoredResidents: SponsoredResident[] = (assignments || []).map((a: any) => {
    // Supabase returns joined data as objects when using !inner
    const resident = a.residents;
    const house = a.houses;
    return {
      id: resident?.id || a.resident_id,
      assignment_id: a.id,
      resident_id: a.resident_id,
      first_name: resident?.first_name || '',
      last_name: resident?.last_name || '',
      resident_role: a.resident_role as ResidentRole,
      house_id: a.house_id,
      house_number: house?.house_number || '',
      street_name: house?.streets?.name || '',
    };
  });

  return {
    success: true,
    error: null,
    data: sponsoredResidents,
  };
}

/**
 * Process sponsor cascade actions for sponsored residents
 *
 * Called after sponsor removal to handle their sponsored residents according to specified actions.
 *
 * Business Rules:
 * - domestic_staff, caretaker, contractor REQUIRE a sponsor - must be 'remove' or 'transfer'
 * - co_resident, household_member do NOT require sponsor - can be 'remove', 'transfer', or 'keep_unsupported'
 */
export async function processSponsorCascade(
  sponsorResidentId: string,
  houseId: string,
  actions: SponsoredResidentAction[],
  moveOutDate?: string,
  notes?: string
): Promise<ProcessSponsorCascadeResponse> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const today = moveOutDate || new Date().toISOString().split('T')[0];
  const results = { removed: 0, transferred: 0, kept: 0 };

  // Get sponsored residents to validate actions
  const { data: assignments, error: fetchError } = await supabase
    .from('resident_houses')
    .select('id, resident_id, resident_role')
    .eq('sponsor_resident_id', sponsorResidentId)
    .eq('house_id', houseId)
    .eq('is_active', true);

  if (fetchError) {
    return { success: false, error: 'Failed to fetch sponsored residents' };
  }

  // Create a map for quick lookup
  const assignmentMap = new Map(
    (assignments || []).map(a => [a.id, a])
  );

  // Validate and process each action
  for (const action of actions) {
    const assignment = assignmentMap.get(action.assignment_id);
    if (!assignment) {
      console.warn(`[processSponsorCascade] Assignment ${action.assignment_id} not found or not sponsored by this resident`);
      continue;
    }

    const role = assignment.resident_role as ResidentRole;

    // Validate action based on role
    if (action.action === 'keep_unsupported' && requiresSponsor(role)) {
      return {
        success: false,
        error: `${role} requires a sponsor and cannot be kept without one. Please remove or transfer.`,
      };
    }

    if (action.action === 'transfer' && !action.new_sponsor_id) {
      return {
        success: false,
        error: 'Transfer action requires a new sponsor ID',
      };
    }

    // Process the action
    switch (action.action) {
      case 'remove': {
        const { error: removeError } = await supabase
          .from('resident_houses')
          .update({
            is_active: false,
            move_out_date: today,
          })
          .eq('id', action.assignment_id);

        if (removeError) {
          console.error('[processSponsorCascade] Remove error:', removeError);
          return { success: false, error: 'Failed to remove sponsored resident' };
        }

        // Record history
        try {
          await adminClient.from('house_ownership_history').insert({
            house_id: houseId,
            resident_id: assignment.resident_id,
            resident_role: role,
            event_type: 'move_out',
            event_date: today,
            notes: notes || 'Removed due to sponsor departure',
            is_current: false,
            created_by: user.id,
          });
        } catch (historyError) {
          console.error('[processSponsorCascade] History error:', historyError);
        }

        results.removed++;
        break;
      }

      case 'transfer': {
        // Verify new sponsor is a valid primary resident at this house
        const { data: newSponsor, error: sponsorError } = await supabase
          .from('resident_houses')
          .select('id, resident_id')
          .eq('resident_id', action.new_sponsor_id!)
          .eq('house_id', houseId)
          .eq('is_active', true)
          .in('resident_role', ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'])
          .single();

        if (sponsorError || !newSponsor) {
          return {
            success: false,
            error: 'New sponsor must be a primary resident at this house',
          };
        }

        const { error: transferError } = await supabase
          .from('resident_houses')
          .update({
            sponsor_resident_id: action.new_sponsor_id,
          })
          .eq('id', action.assignment_id);

        if (transferError) {
          console.error('[processSponsorCascade] Transfer error:', transferError);
          return { success: false, error: 'Failed to transfer sponsored resident' };
        }

        // Record history
        try {
          await adminClient.from('house_ownership_history').insert({
            house_id: houseId,
            resident_id: assignment.resident_id,
            resident_role: role,
            event_type: 'role_change',
            event_date: today,
            notes: notes || 'Sponsor transferred due to previous sponsor departure',
            is_current: true,
            created_by: user.id,
          });
        } catch (historyError) {
          console.error('[processSponsorCascade] History error:', historyError);
        }

        results.transferred++;
        break;
      }

      case 'keep_unsupported': {
        // Clear the sponsor but keep the assignment active
        const { error: keepError } = await supabase
          .from('resident_houses')
          .update({
            sponsor_resident_id: null,
          })
          .eq('id', action.assignment_id);

        if (keepError) {
          console.error('[processSponsorCascade] Keep error:', keepError);
          return { success: false, error: 'Failed to update sponsored resident' };
        }

        results.kept++;
        break;
      }
    }
  }

  // Revalidate paths
  revalidatePath('/residents');
  revalidatePath('/houses');
  revalidatePath(`/houses/${houseId}`);

  return {
    success: true,
    error: null,
    processed: results,
  };
}

/**
 * Auto-cascade all sponsored residents when a sponsor leaves
 *
 * This is a convenience function that automatically removes all sponsored residents
 * when their sponsor leaves. Use processSponsorCascade for more granular control.
 *
 * Default behavior:
 * - Roles requiring sponsor (domestic_staff, caretaker, contractor): Removed
 * - Roles not requiring sponsor (co_resident, household_member): Kept without sponsor
 */
export async function autoCascadeSponsoredResidents(
  sponsorResidentId: string,
  houseId: string,
  moveOutDate?: string,
  notes?: string
): Promise<ProcessSponsorCascadeResponse> {
  const supabase = await createServerSupabaseClient();

  // Get all sponsored residents
  const { data: sponsored, success, error } = await getSponsoredResidents(sponsorResidentId, houseId);

  if (!success || !sponsored) {
    return { success: false, error: error || 'Failed to get sponsored residents' };
  }

  if (sponsored.length === 0) {
    return { success: true, error: null, processed: { removed: 0, transferred: 0, kept: 0 } };
  }

  // Determine actions based on role requirements
  const actions: SponsoredResidentAction[] = sponsored.map(s => ({
    assignment_id: s.assignment_id,
    action: requiresSponsor(s.resident_role) ? 'remove' : 'keep_unsupported',
  }));

  return processSponsorCascade(sponsorResidentId, houseId, actions, moveOutDate, notes);
}

/**
 * Get potential sponsors for a resident at a house
 *
 * Returns all primary residents at the house who can sponsor secondary roles
 */
export async function getPotentialSponsors(
  houseId: string,
  excludeResidentId?: string
): Promise<{ success: boolean; error: string | null; data?: Array<{ resident_id: string; first_name: string; last_name: string; resident_role: ResidentRole }> }> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  let query = supabase
    .from('resident_houses')
    .select(`
      resident_id,
      resident_role,
      residents!inner(
        first_name,
        last_name
      )
    `)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .in('resident_role', ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer']);

  if (excludeResidentId) {
    query = query.neq('resident_id', excludeResidentId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getPotentialSponsors] Error:', error);
    return { success: false, error: 'Failed to fetch potential sponsors' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sponsors = (data || []).map((d: any) => {
    const resident = d.residents;
    return {
      resident_id: d.resident_id,
      first_name: resident?.first_name || '',
      last_name: resident?.last_name || '',
      resident_role: d.resident_role as ResidentRole,
    };
  });

  return { success: true, error: null, data: sponsors };
}
