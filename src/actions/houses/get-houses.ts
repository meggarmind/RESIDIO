'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sanitizeSearchInput } from '@/lib/utils';
import type { HouseWithStreet, ResidentRole } from '@/types/database';
import type { HouseSearchParams } from '@/lib/validators/house';

type HouseWithRoles = HouseWithStreet & {
  activeRoles: ResidentRole[];
};

type GetHousesResponse = {
  data: HouseWithStreet[];
  count: number;
  error: string | null;
}

type GetHousesWithRolesResponse = {
  data: HouseWithRoles[];
  count: number;
  error: string | null;
}

export async function getHouses(params: Partial<HouseSearchParams> = {}): Promise<GetHousesResponse> {
  const supabase = await createServerSupabaseClient();
  const { search, street_id, house_type_id, is_occupied, page = 1, limit = 20 } = params;

  let query = supabase
    .from('houses')
    .select(`
      *,
      street:streets(*),
      house_type:house_types(*)
    `, { count: 'exact' })
    .eq('is_active', true);

  // Apply filters
  if (search) {
    const sanitized = sanitizeSearchInput(search);
    query = query.ilike('house_number', `%${sanitized}%`);
  }
  if (street_id) {
    query = query.eq('street_id', street_id);
  }
  if (house_type_id) {
    query = query.eq('house_type_id', house_type_id);
  }
  if (typeof is_occupied === 'boolean') {
    query = query.eq('is_occupied', is_occupied);
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to).order('house_number');

  const { data, error, count } = await query;

  return {
    data: (data as HouseWithStreet[]) ?? [],
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

/**
 * Get houses with their active roles (owner, tenant) for filtering in forms.
 * This is useful when creating residents to filter out houses that already have an owner/tenant.
 */
export async function getHousesWithRoles(params: Partial<HouseSearchParams> = {}): Promise<GetHousesWithRolesResponse> {
  const supabase = await createServerSupabaseClient();
  const { search, street_id, house_type_id, is_occupied, page = 1, limit = 20 } = params;

  let query = supabase
    .from('houses')
    .select(`
      *,
      street:streets(*),
      house_type:house_types(*),
      resident_houses!inner(resident_role, is_active)
    `, { count: 'exact' })
    .eq('is_active', true);

  // Apply filters
  if (search) {
    const sanitized = sanitizeSearchInput(search);
    query = query.ilike('house_number', `%${sanitized}%`);
  }
  if (street_id) {
    query = query.eq('street_id', street_id);
  }
  if (house_type_id) {
    query = query.eq('house_type_id', house_type_id);
  }
  if (typeof is_occupied === 'boolean') {
    query = query.eq('is_occupied', is_occupied);
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to).order('house_number');

  const { data, error, count } = await query;

  // Also fetch houses without any resident_houses (unoccupied)
  let unoccupiedQuery = supabase
    .from('houses')
    .select(`
      *,
      street:streets(*),
      house_type:house_types(*)
    `)
    .eq('is_active', true)
    .eq('is_occupied', false);

  if (search) {
    const sanitized = sanitizeSearchInput(search);
    unoccupiedQuery = unoccupiedQuery.ilike('house_number', `%${sanitized}%`);
  }
  if (street_id) {
    unoccupiedQuery = unoccupiedQuery.eq('street_id', street_id);
  }
  if (house_type_id) {
    unoccupiedQuery = unoccupiedQuery.eq('house_type_id', house_type_id);
  }

  const { data: unoccupiedData } = await unoccupiedQuery;

  // Transform occupied houses to include activeRoles
  const occupiedHouses: HouseWithRoles[] = (data ?? []).map((house: HouseWithStreet & { resident_houses?: { resident_role: ResidentRole; is_active: boolean }[] }) => ({
    ...house,
    activeRoles: (house.resident_houses ?? [])
      .filter((rh) => rh.is_active)
      .map((rh) => rh.resident_role),
  }));

  // Transform unoccupied houses (no active roles)
  const unoccupiedHouses: HouseWithRoles[] = (unoccupiedData ?? []).map((house: HouseWithStreet) => ({
    ...house,
    activeRoles: [],
  }));

  // Combine and dedupe (in case of overlap)
  const allHousesMap = new Map<string, HouseWithRoles>();
  [...unoccupiedHouses, ...occupiedHouses].forEach((house) => {
    allHousesMap.set(house.id, house);
  });

  const allHouses = Array.from(allHousesMap.values()).sort((a, b) =>
    a.house_number.localeCompare(b.house_number)
  );

  return {
    data: allHouses,
    count: count ?? 0,
    error: error?.message ?? null,
  };
}
