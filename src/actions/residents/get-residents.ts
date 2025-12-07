'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ResidentWithHouses } from '@/types/database';
import type { ResidentSearchParams } from '@/lib/validators/resident';

export interface GetResidentsResponse {
  data: ResidentWithHouses[];
  count: number;
  error: string | null;
}

export async function getResidents(params: Partial<ResidentSearchParams> = {}): Promise<GetResidentsResponse> {
  const supabase = await createServerSupabaseClient();
  const { search, status, verification, type, street_id, house_id, page = 1, limit = 20 } = params;

  let query = supabase
    .from('residents')
    .select(`
      *,
      resident_houses(
        *,
        house:houses(
          *,
          street:streets(*),
          house_type:house_types(*)
        )
      )
    `, { count: 'exact' });

  // Apply filters
  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,resident_code.eq.${search},phone_primary.ilike.%${search}%`);
  }
  if (status) {
    query = query.eq('account_status', status);
  }
  if (verification) {
    query = query.eq('verification_status', verification);
  }
  if (type) {
    query = query.eq('resident_type', type);
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to).order('created_at', { ascending: false });

  const { data, error, count } = await query;

  // If filtering by street or house, we need to filter the results
  let filteredData = (data as ResidentWithHouses[]) ?? [];

  if (street_id) {
    filteredData = filteredData.filter(resident =>
      resident.resident_houses?.some(rh => rh.house?.street_id === street_id && rh.is_active)
    );
  }

  if (house_id) {
    filteredData = filteredData.filter(resident =>
      resident.resident_houses?.some(rh => rh.house_id === house_id && rh.is_active)
    );
  }

  return {
    data: filteredData,
    count: count ?? 0,
    error: error?.message ?? null,
  };
}
