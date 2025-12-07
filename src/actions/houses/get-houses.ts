'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HouseWithStreet } from '@/types/database';
import type { HouseSearchParams } from '@/lib/validators/house';

export interface GetHousesResponse {
  data: HouseWithStreet[];
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
    query = query.ilike('house_number', `%${search}%`);
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
