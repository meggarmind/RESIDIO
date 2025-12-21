'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HouseOwnershipHistoryWithResident, OwnershipEventType, ResidentRole } from '@/types/database';
import { RESIDENT_ROLE_LABELS } from '@/types/database';

// Extended type with computed end_date for ownership periods
type OwnershipHistoryWithEndDate = HouseOwnershipHistoryWithResident & {
  end_date: string | null; // Computed from move_out_date or ownership_end event
};

// Response type (not exported from 'use server' file)
interface OwnershipHistoryResponse {
  data: OwnershipHistoryWithEndDate[] | null;
  error: string | null;
}

// Event type labels for UI display (not exported - use in formatHistoryEvent only)
const OWNERSHIP_EVENT_LABELS: Record<OwnershipEventType, string> = {
  house_added: 'Added to Portal',
  ownership_start: 'Ownership Started',
  ownership_transfer: 'Ownership Transferred',
  ownership_end: 'Ownership Ended',
  move_in: 'Moved In',
  move_out: 'Moved Out',
  role_change: 'Role Changed',
};

/**
 * Get the full ownership and occupancy history for a house
 * Returns all history events in chronological order (newest first)
 * Enriched with computed end_date from resident_houses move_out_date
 */
export async function getOwnershipHistory(houseId: string): Promise<OwnershipHistoryResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  if (!houseId) {
    return { data: null, error: 'House ID is required' };
  }

  // Fetch history records
  const { data: historyData, error: historyError } = await supabase
    .from('house_ownership_history')
    .select(`
      *,
      resident:residents (
        id,
        first_name,
        last_name,
        resident_code,
        entity_type,
        company_name
      )
    `)
    .eq('house_id', houseId)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (historyError) {
    console.error('[getOwnershipHistory] Error:', historyError);
    return { data: null, error: historyError.message };
  }

  // Fetch resident_houses records to get move_out_date for end dates
  const { data: residentHousesData } = await supabase
    .from('resident_houses')
    .select('resident_id, move_in_date, move_out_date, is_active')
    .eq('house_id', houseId);

  // Create a map of resident_id -> move_out_date for quick lookup
  const residentMoveOutMap = new Map<string, { move_out_date: string | null; is_active: boolean }>();
  if (residentHousesData) {
    for (const rh of residentHousesData) {
      residentMoveOutMap.set(rh.resident_id, {
        move_out_date: rh.move_out_date,
        is_active: rh.is_active
      });
    }
  }

  // Enrich history records with computed end_date
  const enrichedData: OwnershipHistoryWithEndDate[] = (historyData as HouseOwnershipHistoryWithResident[]).map(record => {
    let end_date: string | null = null;

    // For ownership_start or move_in events, compute end_date
    if (
      (record.event_type === 'ownership_start' || record.event_type === 'move_in') &&
      record.resident_id
    ) {
      const residentHouse = residentMoveOutMap.get(record.resident_id);
      if (residentHouse && !residentHouse.is_active && residentHouse.move_out_date) {
        end_date = residentHouse.move_out_date;
      }
    }

    return {
      ...record,
      end_date
    };
  });

  return {
    data: enrichedData,
    error: null
  };
}

/**
 * Get the current owner of a house
 * Returns the resident with is_current = true and an ownership role
 */
export async function getCurrentOwner(houseId: string): Promise<{
  data: HouseOwnershipHistoryWithResident | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  if (!houseId) {
    return { data: null, error: 'House ID is required' };
  }

  const { data, error } = await supabase
    .from('house_ownership_history')
    .select(`
      *,
      resident:residents (
        id,
        first_name,
        last_name,
        resident_code,
        entity_type,
        company_name
      )
    `)
    .eq('house_id', houseId)
    .eq('is_current', true)
    .in('resident_role', ['resident_landlord', 'non_resident_landlord', 'developer'])
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('[getCurrentOwner] Error:', error);
    return { data: null, error: error.message };
  }

  return {
    data: data as HouseOwnershipHistoryWithResident | null,
    error: null
  };
}

/**
 * Format an ownership history entry for display
 * Returns a human-readable description of the event
 */
export async function formatHistoryEvent(event: HouseOwnershipHistoryWithResident): Promise<string> {
  // Handle house_added events (no resident)
  if (event.event_type === 'house_added' || !event.resident) {
    return 'House added to Residio portal';
  }

  const residentName = event.resident.entity_type === 'corporate' && event.resident.company_name
    ? event.resident.company_name
    : `${event.resident.first_name} ${event.resident.last_name}`;

  const roleLabel = event.resident_role ? RESIDENT_ROLE_LABELS[event.resident_role as ResidentRole] : '';
  const previousRoleLabel = event.previous_role
    ? RESIDENT_ROLE_LABELS[event.previous_role as ResidentRole]
    : null;

  switch (event.event_type) {
    case 'ownership_start':
      return `${residentName} became the ${roleLabel}`;
    case 'ownership_transfer':
      return `Ownership transferred to ${residentName} as ${roleLabel}`;
    case 'ownership_end':
      return `${residentName} transferred ownership`;
    case 'move_in':
      return `${residentName} moved in as ${roleLabel}`;
    case 'move_out':
      return `${residentName} moved out`;
    case 'role_change':
      return previousRoleLabel
        ? `${residentName} changed from ${previousRoleLabel} to ${roleLabel}`
        : `${residentName} role changed to ${roleLabel}`;
    default:
      return `${residentName} - ${OWNERSHIP_EVENT_LABELS[event.event_type as OwnershipEventType]}`;
  }
}
