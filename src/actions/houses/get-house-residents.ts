'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ResidentRole, EntityType } from '@/types/database';

// Resident summary for display in property cards and occupant lists
export interface ResidentSummary {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  entity_type: EntityType;
  resident_code: string;
  phone_primary: string | null;
  resident_role: ResidentRole;
  is_primary: boolean;
  move_in_date: string | null;
}

export interface GetHouseResidentsResult {
  data: ResidentSummary[] | null;
  error: string | null;
}

/**
 * Get all active residents linked to a specific house.
 * Returns resident summaries including their role and primary status.
 */
export async function getHouseResidents(houseId: string): Promise<GetHouseResidentsResult> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Not authenticated' };
  }

  const { data, error } = await supabase
    .from('resident_houses')
    .select(`
      resident_role,
      is_primary,
      move_in_date,
      resident:residents!resident_houses_resident_id_fkey (
        id,
        first_name,
        last_name,
        company_name,
        entity_type,
        resident_code,
        phone_primary
      )
    `)
    .eq('house_id', houseId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('move_in_date', { ascending: true });

  if (error) {
    console.error('Error fetching house residents:', error);
    return { data: null, error: error.message };
  }

  // Transform the nested data into flat ResidentSummary objects
  // Note: Supabase nested selects with !inner return an array even for 1:1 relations
  const residents: ResidentSummary[] = (data || []).map((rh) => {
    const residentData = rh.resident as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      company_name: string | null;
      entity_type: EntityType;
      resident_code: string;
      phone_primary: string | null;
    };

    return {
      id: residentData.id,
      first_name: residentData.first_name,
      last_name: residentData.last_name,
      company_name: residentData.company_name,
      entity_type: residentData.entity_type,
      resident_code: residentData.resident_code,
      phone_primary: residentData.phone_primary,
      resident_role: rh.resident_role as ResidentRole,
      is_primary: rh.is_primary ?? false,
      move_in_date: rh.move_in_date,
    };
  });

  return { data: residents, error: null };
}

/**
 * Get residents for multiple houses in a single query.
 * Useful for dashboard where we need residents for all user's properties.
 */
export async function getHouseResidentsBatch(
  houseIds: string[]
): Promise<{ data: Record<string, ResidentSummary[]> | null; error: string | null }> {
  if (houseIds.length === 0) {
    return { data: {}, error: null };
  }

  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Not authenticated' };
  }

  const { data, error } = await supabase
    .from('resident_houses')
    .select(`
      house_id,
      resident_role,
      is_primary,
      move_in_date,
      resident:residents!resident_houses_resident_id_fkey (
        id,
        first_name,
        last_name,
        company_name,
        entity_type,
        resident_code,
        phone_primary
      )
    `)
    .in('house_id', houseIds)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('move_in_date', { ascending: true });

  if (error) {
    console.error('Error fetching house residents batch:', error);
    return { data: null, error: error.message };
  }

  // Group residents by house_id
  const residentsByHouse: Record<string, ResidentSummary[]> = {};

  for (const rh of data || []) {
    const houseId = rh.house_id;
    if (!residentsByHouse[houseId]) {
      residentsByHouse[houseId] = [];
    }

    const residentData = rh.resident as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      company_name: string | null;
      entity_type: EntityType;
      resident_code: string;
      phone_primary: string | null;
    };

    residentsByHouse[houseId].push({
      id: residentData.id,
      first_name: residentData.first_name,
      last_name: residentData.last_name,
      company_name: residentData.company_name,
      entity_type: residentData.entity_type,
      resident_code: residentData.resident_code,
      phone_primary: residentData.phone_primary,
      resident_role: rh.resident_role as ResidentRole,
      is_primary: rh.is_primary ?? false,
      move_in_date: rh.move_in_date,
    });
  }

  // Initialize empty arrays for houses with no residents
  for (const houseId of houseIds) {
    if (!residentsByHouse[houseId]) {
      residentsByHouse[houseId] = [];
    }
  }

  return { data: residentsByHouse, error: null };
}
